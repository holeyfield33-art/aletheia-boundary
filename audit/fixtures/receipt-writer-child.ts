/** Disposable subprocess fixture for writer exclusion tests. */
import fs from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { ReceiptLog } from "../../src/receipt/log.js";
import { loadOrCreateKeyPair } from "../../src/receipt/crypto.js";
import { Boundary } from "../../src/boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../../src/policy/engine.js";

const [dir, path, mode] = process.argv.slice(2);
const write = fs.writeSync.bind(fs);
function emit(message: unknown) { write(1, Buffer.from(JSON.stringify(message) + "\n")); }
function hold() {
  emit({ kind: "held" });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
  process.exit(3);
}
try {
  const keys = loadOrCreateKeyPair(join(dir, "key.ed25519"));
  if (mode === "startup-hold") {
    const read = fs.readFileSync.bind(fs);
    fs.readFileSync = ((value: unknown, ...args: unknown[]) => {
      if (value === path) hold();
      return (read as (...a: unknown[]) => unknown)(value, ...args);
    }) as typeof fs.readFileSync;
  }
  const log = new ReceiptLog(keys, path);
  const boundary = new Boundary(new PolicyEngine(loadPolicyFromObject({ version: "1", defaultEffect: "allow", rules: [] })), {
    async execute() { return { data: "SYNTHETIC_RELEASE", transforms: [] }; },
  }, log);
  const append = async (command: string) => {
    if (command === "hold") {
      fs.writeSync = ((...args: unknown[]) => {
        hold();
        return (write as (...a: unknown[]) => number)(...args);
      }) as typeof fs.writeSync;
    }
    try {
      const result = await boundary.handle({ action: "query", resource: "public.synthetic" });
      emit({ kind: "result", result });
    } catch { emit({ kind: "refused" }); }
  };
  if (mode === "once") { await append("append"); }
  else {
    emit({ kind: "ready" });
    const lines = createInterface({ input: process.stdin });
    lines.on("line", (line) => { void append(line); });
  }
} catch { emit({ kind: "startup-refused" }); process.exitCode = 2; }
