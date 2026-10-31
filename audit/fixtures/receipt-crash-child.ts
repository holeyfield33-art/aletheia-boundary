/** Test-only child. Never imported by the production server. */
import fs from "node:fs";
import { join } from "node:path";
import { Boundary } from "../../src/boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../../src/policy/engine.js";
import { ReceiptLog } from "../../src/receipt/log.js";
import { loadOrCreateKeyPair } from "../../src/receipt/crypto.js";

const [dir, phase] = process.argv.slice(2);
const keys = loadOrCreateKeyPair(join(dir, "key.ed25519"));
const path = join(dir, "receipts.jsonl");
const request = { id: "interrupted", action: "query" as const, resource: "public.synthetic", receivedAt: "test" };
const originalWrite = fs.writeSync.bind(fs);
const originalSync = fs.fsyncSync.bind(fs);
function emit(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  const n = originalWrite(1, bytes);
  if (n !== bytes.length) throw new Error("Incomplete test handshake");
}
function stopAt(name: string) {
  if (phase !== name) return;
  emit({ stoppedAt: name });
  // Parent forcibly kills this process while the real operation is suspended.
  // A bounded wait ensures an orphaned test child eventually exits as a failure.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
  process.exit(3);
}

async function main() {
  const log = new ReceiptLog(keys, path);
  if (phase === "recover") {
    const loaded = log.getAll();
    const continued = log.create({ ...request, id: "after-restart" }, {
      outcome: "deny", reason: "recovery test", decidedAt: "test",
    });
    emit({ recovered: loaded.length, previousHead: loaded.at(-1)?.contentHash, continued: continued.contentHash });
    return;
  }
  // Only the log append is called after installing these test-local wrappers.
  // The original Node filesystem calls still perform the actual writes/syncs.
  fs.writeSync = ((fd: number, bytes: Buffer, offset: number, length: number, position: number) => {
    stopAt("before-append");
    if (phase === "partial-append") {
      const prefix = Math.max(1, Math.floor(length / 2));
      const written = originalWrite(fd, bytes, offset, prefix, position);
      if (written !== prefix) throw new Error("Unexpected fixture short write");
      stopAt("partial-append");
    }
    const n = originalWrite(fd, bytes, offset, length, position);
    stopAt("after-append-before-sync");
    return n;
  }) as typeof fs.writeSync;
  fs.fsyncSync = (fd: number) => {
    originalSync(fd);
    stopAt("after-sync");
  };
  const policy = new PolicyEngine(loadPolicyFromObject({ version: "1", defaultEffect: "allow", rules: [] }));
  const boundary = new Boundary(policy, {
    async execute() { return { data: "SYNTHETIC_RELEASE", transforms: [] }; },
  }, log);
  const result = await boundary.handle(request);
  stopAt("before-response");
  emit({ response: result });
  stopAt("after-response");
  throw new Error("Test phase was never reached");
}
main().catch(() => {
  emit({ recoveryRefused: true });
  process.exitCode = 2;
});
