/** Forced-process-termination recovery drill; synthetic files only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { ReceiptLog, verifyReceiptChain } from "./log.js";
import { generateKeyPair } from "./crypto.js";
import type { BoundaryResult, Receipt } from "../types.js";

const phases = ["before-append", "partial-append", "after-append-before-sync", "after-sync", "before-response", "after-response"];
const childPath = "audit/fixtures/receipt-crash-child.ts";

async function interrupt(dir: string, phase: string): Promise<BoundaryResult | undefined> {
  const child = spawn(process.execPath, ["--import", "tsx", childPath, dir, phase], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "", reached = false, response: BoundaryResult | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Child phase timed out: ${phase}; ${errors}`)); }, 15000);
      const fail = (error: Error) => { clearTimeout(timer); child.kill("SIGKILL"); reject(error); };
      child.on("error", fail);
      child.stderr.on("data", chunk => { errors += String(chunk); });
      child.stdout.on("data", chunk => {
        output += String(chunk);
        let end: number;
        while ((end = output.indexOf("\n")) >= 0) {
          const line = output.slice(0, end); output = output.slice(end + 1);
          try {
            const message = JSON.parse(line);
            if (message.response) response = message.response;
            if (message.stoppedAt === phase) {
              reached = true;
              if (!child.kill("SIGKILL")) fail(new Error("Could not terminate child"));
            }
          } catch (err) { fail(err as Error); }
        }
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        if (!reached) reject(new Error(`Child exited before ${phase}: ${code}/${signal}; ${errors}`));
        else if (code === 0) reject(new Error("Expected abrupt termination, got successful exit"));
        else resolve();
      });
    });
    return response;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => { child.once("close", () => resolve()); child.kill("SIGKILL"); });
    }
  }
}

for (const phase of phases) {
  test(`R-${phase}: forced termination preserves evidence and enforces restart contract`, { timeout: 25000 }, async t => {
    const dir = fs.mkdtempSync(join(tmpdir(), "boundary-crash-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const keys = generateKeyPair();
    fs.writeFileSync(join(dir, "key.ed25519"), keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const publicPath = join(dir, "public.pem");
    fs.writeFileSync(publicPath, keys.publicKey.export({ type: "spki", format: "pem" }));
    const path = join(dir, "receipts.jsonl");
    const seed = new ReceiptLog(keys, path).create({ id: "seed", action: "query", resource: "public.synthetic", receivedAt: "test" }, { outcome: "deny", reason: "seed", decidedAt: "test" });
    const checkpoint = fs.readFileSync(path);
    const response = await interrupt(dir, phase);
    assert.equal(Boolean(response), phase === "after-response", "No response may precede durable append");
    const crashed = fs.readFileSync(path);
    assert.deepEqual(crashed.subarray(0, checkpoint.length), checkpoint, "Previously synced evidence must survive byte-for-byte");
    const offline = spawnSync(process.execPath, ["--import", "tsx", "src/receipt/verify-cli.ts", "--log", path, "--pub", publicPath], { encoding: "utf8", timeout: 10000 });
    const crashedLock = fs.existsSync(path + ".writer-lock");
    assert.equal(crashedLock, !["before-response", "after-response"].includes(phase));
    if (crashedLock) {
      const lockedRestart = spawnSync(process.execPath, ["--import", "tsx", childPath, dir, "recover"], { encoding: "utf8", timeout: 10000 });
      assert.equal(lockedRestart.error, undefined);
      assert.equal(lockedRestart.status, 2, "Crash lock must refuse restart until operator recovery");
      assert.deepEqual(fs.readFileSync(path), crashed, "Locked restart cannot change evidence");
      // Disposable-fixture operator drill: child is confirmed dead and evidence preserved.
      fs.renameSync(path + ".writer-lock", join(dir, "quarantined-writer-lock"));
    }
    const restarted = spawnSync(process.execPath, ["--import", "tsx", childPath, dir, "recover"], { encoding: "utf8", timeout: 10000 });
    assert.equal(offline.error, undefined);
    assert.equal(restarted.error, undefined);
    if (phase === "partial-append") {
      assert.ok(crashed.length > checkpoint.length);
      assert.equal(offline.status, 1, offline.stderr);
      assert.equal(restarted.status, 2, restarted.stderr);
      assert.equal(JSON.parse(restarted.stdout).recoveryRefused, true);
      assert.deepEqual(fs.readFileSync(path), crashed, "Refused restart must never trim or repair evidence");
    } else {
      const expected = phase === "before-append" ? 1 : 2;
      assert.equal(offline.status, 0, offline.stderr);
      assert.equal(restarted.status, 0, restarted.stderr);
      const recovery = JSON.parse(restarted.stdout);
      assert.equal(recovery.recovered, expected);
      const receipts = fs.readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line) as Receipt);
      assert.equal(verifyReceiptChain(receipts, keys.publicKey).ok, true);
      assert.equal(receipts.length, expected + 1);
      assert.equal(receipts[0].contentHash, seed.contentHash);
      assert.equal(receipts.at(-1)?.prevHash, receipts.at(-2)?.contentHash);
      assert.equal(recovery.continued, receipts.at(-1)?.contentHash);
      if (response) {
        assert.equal(response.ok, true);
        assert.equal(response.payload?.data, "SYNTHETIC_RELEASE");
        assert.deepEqual(response.receipt, receipts[1], "Published receipt must exactly match persisted evidence");
      }
    }
    t.diagnostic(`phase=${phase} response=${Boolean(response)} offlineExit=${offline.status} restartExit=${restarted.status} prefixPreserved=true staleLockRefused=${crashedLock} operatorQuarantine=${crashedLock}`);
  });
}
