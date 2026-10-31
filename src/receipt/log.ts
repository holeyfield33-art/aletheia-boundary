import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  BoundaryRequest,
  Decision,
  MinimizedPayload,
  Receipt,
} from "../types.js";
import { signHash, verifyHash, type KeyPair } from "./crypto.js";
import { canonicalJson } from "./canonical.js";
import { parseReceiptCheckpoint, publicKeySha256, verifyReceiptCheckpoint, type ReceiptCheckpoint } from "./checkpoint.js";

/**
 * Append-only, hash-chained, Ed25519-signed receipt log.
 *
 * Customer owns the private key and the log file.
 * Vendor cannot rewrite history.
 */
export class ReceiptLog {
  private failed = false;
  private diskContents = "";
  private lastHash: string | null = null;
  private readonly receipts: Receipt[] = [];
  private readonly logPath: string | null;

  constructor(
    private readonly keyPair: KeyPair,
    logPath?: string,
    options?: { verifyOnLoad?: boolean; checkpoint?: ReceiptCheckpoint },
  ) {
    this.logPath = logPath ? resolve(logPath) : null;
    const checkpoint = options?.checkpoint === undefined ? undefined : parseReceiptCheckpoint(options.checkpoint);
    if (checkpoint && (!this.logPath || !fs.existsSync(this.logPath))) {
      throw new Error("Checkpoint requires an existing receipt log; refusing to recreate history");
    }
    if (this.logPath) {
      if (options?.verifyOnLoad === false) throw new Error("Receipt verification cannot be disabled");
      fs.mkdirSync(dirname(this.logPath), { recursive: true });
      if (!fs.existsSync(this.logPath)) {
        const fd = fs.openSync(this.logPath, "wx", 0o600);
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        // Node cannot fsync a directory on Windows. See operational limits.
        if (process.platform !== "win32") {
          const dir = fs.openSync(dirname(this.logPath), "r");
          try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
        }
      }
      this.hydrateFromDisk(true);
      if (checkpoint) {
        const verified = verifyReceiptCheckpoint(this.receipts, this.keyPair.publicKey, checkpoint);
        if (!verified.ok) throw new Error(`Receipt checkpoint verification failed: ${verified.reason}`);
      }
    }
  }

  private hydrateFromDisk(verify: boolean): void {
    if (!this.logPath) return;
    this.diskContents = fs.readFileSync(this.logPath, "utf8");
    if (this.diskContents && !this.diskContents.endsWith("\n")) {
      throw new Error("Incomplete receipt log tail; refusing to start");
    }
    const lines = this.diskContents.split("\n").filter(Boolean);
    const loaded: Receipt[] = [];
    for (let i = 0; i < lines.length; i++) {
      let r: Receipt;
      try {
        r = JSON.parse(lines[i]) as Receipt;
      } catch {
        throw new Error(
          `aletheia-boundary: receipt log line ${i + 1} is not valid JSON. Refusing to start.`,
        );
      }
      loaded.push(r);
    }

    if (verify && loaded.length > 0) {
      const result = verifyReceiptChain(loaded, this.keyPair.publicKey);
      if (!result.ok) {
        throw new Error(
          `aletheia-boundary: receipt log failed verification at index ${result.index}: ${result.reason}. Refusing to start.`,
        );
      }
    }

    for (const r of loaded) {
      this.receipts.push(r);
      this.lastHash = r.contentHash;
    }
  }

  create(
    request: BoundaryRequest,
    decision: Decision,
    payload?: MinimizedPayload,
  ): Receipt {
    if (this.failed) throw new Error("Receipt log unavailable; operator recovery required");
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const payloadSummary = {
      transforms: payload?.transforms ?? [],
      stats: payload?.stats,
    };

    const body = {
      id,
      prevHash: this.lastHash,
      request,
      decision,
      payloadSummary,
      createdAt,
      keyId: this.keyPair.keyId,
    };

    const contentHash = sha256(canonicalJson(body));
    const signature = signHash(this.keyPair.privateKey, contentHash);

    const receipt: Receipt = {
      ...body,
      contentHash,
      signature,
    };

    if (this.logPath) {
      let fd: number | undefined;
      try {
        // One writer per path; never recreate a log deleted during service.
        fd = fs.openSync(this.logPath, "r+");
        if (fs.readFileSync(fd, "utf8") !== this.diskContents) {
          throw new Error("Receipt log changed outside this writer");
        }
        const line = JSON.stringify(receipt) + "\n";
        const bytes = Buffer.from(line);
        const n = fs.writeSync(fd, bytes, 0, bytes.length, Buffer.byteLength(this.diskContents));
        if (n !== bytes.length) throw new Error("Incomplete receipt append");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        this.diskContents += line;
      } catch {
        this.failed = true;
        throw new Error("Receipt persistence failed; no data released");
      } finally {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* failed */ } }
      }
    }
    this.receipts.push(structuredClone(receipt));
    this.lastHash = contentHash;
    return structuredClone(receipt);
  }

  getAll(): readonly Receipt[] {
    return structuredClone(this.receipts);
  }

  getLastHash(): string | null {
    return this.lastHash;
  }

  get keyId(): string {
    return this.keyPair.keyId;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Recompute contentHash for a receipt body (everything except contentHash + signature). */
export function computeContentHash(receipt: Omit<Receipt, "contentHash" | "signature"> | Receipt): string {
  const { contentHash: _c, signature: _s, ...body } = receipt as Receipt;
  return sha256(canonicalJson(body));
}

export interface VerifyResult {
  ok: boolean;
  index?: number;
  reason?: string;
}

/**
 * Verify a single receipt: hash matches body, signature matches hash.
 */
export function verifyReceipt(
  receipt: Receipt,
  publicKey: import("node:crypto").KeyObject,
): VerifyResult {
  const expected = computeContentHash(receipt);
  if (expected !== receipt.contentHash) {
    return {
      ok: false,
      reason: `contentHash mismatch (stored=${receipt.contentHash.slice(0, 12)}… recomputed=${expected.slice(0, 12)}…)`,
    };
  }
  if (!verifyHash(publicKey, receipt.contentHash, receipt.signature)) {
    return { ok: false, reason: "signature invalid" };
  }
  return { ok: true };
}

/**
 * Verify an ordered chain: each receipt verifies, and prevHash links hold.
 */
export function verifyReceiptChain(
  receipts: readonly Receipt[],
  publicKey: import("node:crypto").KeyObject,
): VerifyResult {
  let prev: string | null = null;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (r.prevHash !== prev) {
      return {
        ok: false,
        index: i,
        reason: `prevHash chain break (expected ${prev}, got ${r.prevHash})`,
      };
    }
    const v = verifyReceipt(r, publicKey);
    if (!v.ok) {
      return { ok: false, index: i, reason: v.reason };
    }
    prev = r.contentHash;
  }
  return { ok: true };
}

/** Export a candidate only from a fully verified, nonempty history. Publication is host-owned. */
export function createReceiptCheckpoint(
  receipts: readonly Receipt[], publicKey: import("node:crypto").KeyObject,
): ReceiptCheckpoint {
  const verified = verifyReceiptChain(receipts, publicKey);
  if (!verified.ok || receipts.length === 0) throw new Error("Cannot checkpoint empty or invalid receipt history");
  return parseReceiptCheckpoint({
    version: 1,
    publicKeySha256: publicKeySha256(publicKey),
    receiptCount: receipts.length,
    contentHash: receipts[receipts.length - 1].contentHash,
  });
}
