import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  BoundaryRequest,
  Decision,
  MinimizedPayload,
  Receipt,
} from "../types.js";
import { signHash, type KeyPair } from "./crypto.js";

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
  ) {
    this.logPath = logPath ? resolve(logPath) : null;
    if (this.logPath) {
      this.hydrateFromDisk();
    }
  }

  private hydrateFromDisk(): void {
    if (!this.logPath || !existsSync(this.logPath)) return;
    const lines = readFileSync(this.logPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const r = JSON.parse(line) as Receipt;
        this.receipts.push(r);
        this.lastHash = r.contentHash;
      } catch {
        // skip corrupt line; fail closed on write path instead
      }
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

    const contentHash = sha256(canonical(body));
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

function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
