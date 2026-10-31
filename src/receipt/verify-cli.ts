#!/usr/bin/env node
/**
 * Offline receipt log verification.
 *
 *   npx tsx src/receipt/verify-cli.ts --log logs/receipts.jsonl --pub keys/boundary.pub.pem
 *
 * Exit 0 if the whole chain verifies; exit 1 otherwise.
 */

import { readFileSync, existsSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { resolve } from "node:path";
import type { Receipt } from "../types.js";
import { verifyReceiptChain } from "./log.js";

function usage(): never {
  console.error(
    "Usage: npx tsx src/receipt/verify-cli.ts --log <receipts.jsonl> --pub <public.pem>",
  );
  process.exit(2);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
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

  if (receipts.length === 0) {
    console.log("Empty log — nothing to verify.");
    process.exit(0);
  }

  const result = verifyReceiptChain(receipts, publicKey);
  if (!result.ok) {
    console.error(
      `VERIFY FAILED at index ${result.index}: ${result.reason}`,
    );
    process.exit(1);
  }

  console.log(
    `OK: ${receipts.length} receipt(s) verified. lastHash=${receipts[receipts.length - 1].contentHash}`,
  );
}

main();
