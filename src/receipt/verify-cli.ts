#!/usr/bin/env node
/**
 * Offline receipt log verification.
 *
 *   npx tsx src/receipt/verify-cli.ts --log logs/receipts.jsonl --pub keys/boundary.pub.pem
 *
 * Exit 0 if the whole chain verifies; exit 1 otherwise.
 */

import { readFileSync, existsSync, openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { resolve } from "node:path";
import type { Receipt } from "../types.js";
import { createReceiptCheckpoint, verifyReceiptChain } from "./log.js";
import { loadReceiptCheckpoint, verifyReceiptCheckpoint } from "./checkpoint.js";

function usage(): never {
  console.error(
    "Usage: npx tsx src/receipt/verify-cli.ts --log <receipts.jsonl> --pub <public.pem> [--checkpoint <trusted.json>] [--export-checkpoint <new-candidate.json>]",
  );
  process.exit(2);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

function main() {
  const allowed = new Set(["--log", "--pub", "--checkpoint", "--export-checkpoint"]);
  const seen = new Set<string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i];
    if (!allowed.has(flag) || seen.has(flag)) usage();
    seen.add(flag);
    arg(flag);
  }
  const checkpointPath = arg("--checkpoint");
  const checkpoint = checkpointPath ? loadReceiptCheckpoint(checkpointPath) : undefined;
  const exportPath = arg("--export-checkpoint");
  const logPath = arg("--log") ?? resolve(process.cwd(), "logs/receipts.jsonl");
  const pubPath =
    arg("--pub") ?? resolve(process.cwd(), "keys/boundary.pub.pem");

  if (!existsSync(logPath)) {
    console.error(`Log not found: ${logPath}`);
    process.exit(1);
  }
  if (!existsSync(pubPath)) {
    console.error(`Public key not found: ${pubPath}`);
    process.exit(1);
  }

  const pubPem = readFileSync(pubPath, "utf8");
  const publicKey = createPublicKey(pubPem);

  const text = readFileSync(logPath, "utf8");
  if (text && !text.endsWith("\n")) {
    console.error("VERIFY FAILED: incomplete receipt log tail");
    process.exit(1);
  }
  const lines = text.split("\n").filter(Boolean);
  const receipts: Receipt[] = lines.map((line, i) => {
    try {
      return JSON.parse(line) as Receipt;
    } catch {
      console.error(`Line ${i + 1}: invalid JSON`);
      process.exit(1);
    }
  });

  const result = verifyReceiptChain(receipts, publicKey);
  if (!result.ok) {
    console.error(
      `VERIFY FAILED at index ${result.index}: ${result.reason}`,
    );
    process.exit(1);
  }

  if (checkpoint) {
    const anchored = verifyReceiptCheckpoint(receipts, publicKey, checkpoint);
    if (!anchored.ok) throw new Error(anchored.reason);
  }
  if (exportPath) {
    const candidate = createReceiptCheckpoint(receipts, publicKey);
    // Never overwrite an existing anchor, log, key or other operator file.
    const fd = openSync(exportPath, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify(candidate, null, 2) + "\n"); fsyncSync(fd); }
    finally { closeSync(fd); }
    console.log("Checkpoint candidate exported; independently approve and publish outside the log trust domain");
  }
  console.log(`OK: ${receipts.length} receipt(s) verified. lastHash=${receipts.at(-1)?.contentHash ?? "none"} checkpoint=${checkpoint ? "verified" : "not supplied"}`);
}

try { main(); }
catch { console.error("VERIFY FAILED: log, key, checkpoint or export unavailable/invalid"); process.exitCode = 1; }
