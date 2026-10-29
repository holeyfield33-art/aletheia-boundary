import { createHash, randomUUID } from "node:crypto";
import type {
  BoundaryRequest,
  Decision,
  MinimizedPayload,
  Receipt,
} from "../types.js";

/**
 * In-memory + append-only file hash-chained log.
 *
 * Signature is currently a deterministic placeholder (HMAC-style hash).
 * Replace with real Ed25519 once key management is wired.
 */
export class ReceiptLog {
  private lastHash: string | null = null;
  private readonly receipts: Receipt[] = [];

  constructor(
    private readonly keyId: string = "dev-key",
    private readonly secret: string = "dev-only-change-me"
  ) {}

  create(
    request: BoundaryRequest,
    decision: Decision,
    payload?: MinimizedPayload
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
      keyId: this.keyId,
    };

    const contentHash = sha256(canonical(body));
    // Placeholder signature — replace with Ed25519 sign(contentHash)
    const signature = sha256(`${this.secret}:${contentHash}`);

    const receipt: Receipt = {
      ...body,
      contentHash,
      signature,
    };

    this.receipts.push(receipt);
    this.lastHash = contentHash;
    return receipt;
  }

  getAll(): readonly Receipt[] {
    return this.receipts;
  }

  getLastHash(): string | null {
    return this.lastHash;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
