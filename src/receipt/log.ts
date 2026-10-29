import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  BoundaryRequest,
  Decision,
  MinimizedPayload,
  Receipt,
} from "../types.js";
import { signHash, verifyHash, type KeyPair } from "./crypto.js";
import { canonicalJson } from "./canonical.js";

/**
 * Append-only, hash-chained, Ed25519-signed receipt log.
 *
 * Customer owns the private key and the log file.
 * Vendor cannot rewrite history.
 */
export class ReceiptLog {
  private lastHash: string | null = null;
  private readonly receipts: Receipt[] = [];
  private readonly logPath: string | null;

  constructor(
    private readonly keyPair: KeyPair,
    logPath?: string,
    options?: { verifyOnLoad?: boolean },
  ) {
    this.logPath = logPath ? resolve(logPath) : null;
    if (this.logPath) {
      this.hydrateFromDisk(options?.verifyOnLoad !== false);
    }
  }

  private hydrateFromDisk(verify: boolean): void {
    if (!this.logPath || !existsSync(this.logPath)) return;
    const lines = readFileSync(this.logPath, "utf8").split("\n").filter(Boolean);
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

    this.receipts.push(receipt);
    this.lastHash = contentHash;

    if (this.logPath) {
      mkdirSync(dirname(this.logPath), { recursive: true });
      appendFileSync(this.logPath, JSON.stringify(receipt) + "\n", {
        mode: 0o600,
      });
    }

    return receipt;
  }

  getAll(): readonly Receipt[] {
    return this.receipts;
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
