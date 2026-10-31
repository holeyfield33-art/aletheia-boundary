import { createHash, type KeyObject } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { Receipt } from "../types.js";
import type { VerifyResult } from "./log.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const CheckpointSchema = z.object({
  version: z.literal(1),
  publicKeySha256: Hash,
  receiptCount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  contentHash: Hash,
}).strict();

/** Trusted minimum history, supplied by the host outside the log's trust domain. */
export type ReceiptCheckpoint = z.infer<typeof CheckpointSchema>;

export function parseReceiptCheckpoint(value: unknown): ReceiptCheckpoint {
  const parsed = CheckpointSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid receipt checkpoint");
  return parsed.data;
}

export function publicKeySha256(publicKey: KeyObject): string {
  return createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

export function loadReceiptCheckpoint(path: string): ReceiptCheckpoint {
  try {
    if (statSync(path).size > 4096) throw new Error("Checkpoint too large");
    return parseReceiptCheckpoint(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new Error("Receipt checkpoint unavailable or invalid");
  }
}

/** Call only after verifying the entire signature/hash chain with the same key. */
export function verifyReceiptCheckpoint(
  receipts: readonly Receipt[], publicKey: KeyObject, checkpoint: unknown,
): VerifyResult {
  let expected: ReceiptCheckpoint;
  try { expected = parseReceiptCheckpoint(checkpoint); }
  catch { return { ok: false, reason: "Invalid receipt checkpoint" }; }
  if (expected.publicKeySha256 !== publicKeySha256(publicKey)) {
    return { ok: false, reason: "Checkpoint signing key mismatch" };
  }
  if (receipts.length < expected.receiptCount) {
    return { ok: false, reason: "Receipt history is shorter than trusted checkpoint" };
  }
  if (receipts[expected.receiptCount - 1]?.contentHash !== expected.contentHash) {
    return { ok: false, reason: "Receipt history does not contain trusted checkpoint" };
  }
  return { ok: true };
}
