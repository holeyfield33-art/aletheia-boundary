import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ReceiptLog, createReceiptCheckpoint, verifyReceiptChain } from "./log.js";
import { loadOrCreateKeyPair } from "./crypto.js";
import { canonicalReceiptPath, withReceiptWriterLock } from "./writer-lock.js";

const childPath = "audit/fixtures/receipt-writer-child.ts";
const request = { id: "fixture", action: "query" as const, resource: "public.synthetic", receivedAt: "test" };
const decision = { outcome: "deny" as const, reason: "fixture", decidedAt: "test" };
async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => { child.once("close", () => resolve()); child.kill("SIGKILL"); });
}
function controlled(dir: string, path: string, mode = "") {
  const child = spawn(process.execPath, ["--import", "tsx", childPath, dir, path, mode]);
  let text = "", errors = "", ended = false;
  const messages: any[] = [];
  let waiter: { resolve(v: any): void; reject(e: Error): void } | undefined;
  const reject = (error: Error) => { waiter?.reject(error); waiter = undefined; };
  child.stderr.on("data", chunk => { errors += String(chunk); });
  child.stdout.on("data", chunk => {
    text += String(chunk);
    let end: number;
    while ((end = text.indexOf("\n")) >= 0) {
      const line = text.slice(0, end); text = text.slice(end + 1);
      try {
        const value = JSON.parse(line);
        if (waiter) { const current = waiter; waiter = undefined; current.resolve(value); }
        else messages.push(value);
      } catch { reject(new Error("Invalid child handshake")); }
    }
  });
  child.on("error", reject);
  child.on("close", () => { ended = true; reject(new Error(`Child closed early: ${errors}`)); });
  return {
    child,
    send(command: string) { child.stdin.write(command + "\n"); },
    async next() {
      if (messages.length) return messages.shift();
      if (ended) throw new Error(`Child closed: ${errors}`);
      return await new Promise<any>((resolve, rejectPromise) => {
        const timer = setTimeout(() => { waiter = undefined; rejectPromise(new Error(`Child handshake timed out: ${errors}`)); }, 15000);
        waiter = { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); rejectPromise(error); } };
      });
    },
  };
}
function fixture(t: { after(fn: () => Promise<void>): void }) {
  const dir = fs.mkdtempSync(join(tmpdir(), "boundary-writer-"));
  fs.mkdirSync(join(dir, "logs"));
  const path = canonicalReceiptPath(join(dir, "logs", "receipts.jsonl"));
  const keyPath = join(dir, "key.ed25519");
  const keys = loadOrCreateKeyPair(keyPath);
  const log = new ReceiptLog(keys, path);
  log.create(request, decision);
  const original = fs.readFileSync(path);
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => { await Promise.all(children.map(stop)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, path, keyPath, keys, log, original, lock: path + ".writer-lock",
    start(mode = "") { const c = controlled(dir, path, mode); children.push(c.child); return c; },
    once() { return spawnSync(process.execPath, ["--import", "tsx", childPath, dir, path, "once"], { encoding: "utf8", timeout: 15000 }); },
  };
}

test("W1 reentrant/competing critical sections refuse and poison the losing writer", async t => {
  const f = fixture(t);
  withReceiptWriterLock(f.path, () => {
    assert.throws(() => new ReceiptLog(f.keys, f.path), /writer lock unavailable/);
    assert.throws(() => f.log.create(request, decision), /persistence failed/);
    assert.deepEqual(fs.readFileSync(f.path), f.original);
  });
  assert.throws(() => f.log.create(request, decision), /operator recovery/);
  assert.equal(fs.existsSync(f.lock), false);
});

test("W2 independently initialized processes cannot publish competing successors", async t => {
  const f = fixture(t);
  const a = f.start();
  assert.equal((await a.next()).kind, "ready");
  const b = f.start();
  assert.equal((await b.next()).kind, "ready");
  a.send("append");
  const first = await a.next();
  assert.equal(first.kind, "result");
  assert.equal(first.result.ok, true);
  b.send("append");
  assert.deepEqual(await b.next(), { kind: "refused" });
  b.send("append");
  assert.deepEqual(await b.next(), { kind: "refused" });
  a.send("append");
  const second = await a.next();
  assert.equal(second.kind, "result");
  const loaded = new ReceiptLog(f.keys, f.path).getAll();
  assert.equal(loaded.length, 3);
  assert.equal(verifyReceiptChain(loaded, f.keys.publicKey).ok, true);
  assert.deepEqual(first.result.receipt, loaded[1]);
  assert.deepEqual(second.result.receipt, loaded[2]);
});

test("W3 live contention and stale crash locks refuse; explicit quarantine permits verified recovery", async t => {
  const f = fixture(t);
  const a = f.start();
  assert.equal((await a.next()).kind, "ready");
  const b = f.start();
  assert.equal((await b.next()).kind, "ready");
  a.send("hold");
  assert.equal((await a.next()).kind, "held");
  const startup = f.once();
  assert.equal(startup.status, 2, startup.stderr);
  b.send("append");
  assert.deepEqual(await b.next(), { kind: "refused" });
  assert.deepEqual(fs.readFileSync(f.path), f.original);
  await stop(a.child);
  assert.equal(fs.existsSync(f.lock), true);
  fs.utimesSync(f.lock, new Date(0), new Date(0));
  assert.throws(() => new ReceiptLog(f.keys, f.path), /writer lock unavailable/);
  const onDisk = fs.readFileSync(f.path, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(verifyReceiptChain(onDisk, f.keys.publicKey).ok, true);
  // Test-only operator step, after owner termination and independent evidence verification.
  fs.renameSync(f.lock, join(f.dir, "quarantined-lock"));
  const recovered = new ReceiptLog(f.keys, f.path);
  recovered.create(request, decision);
  assert.equal(verifyReceiptChain(recovered.getAll(), f.keys.publicKey).ok, true);
  b.send("append");
  assert.deepEqual(await b.next(), { kind: "refused" });
});

test("W4 verified startup snapshot excludes another process's writes", async t => {
  const f = fixture(t);
  const reader = f.start("startup-hold");
  assert.equal((await reader.next()).kind, "held");
  const competing = f.once();
  assert.equal(competing.status, 2, competing.stderr);
  assert.deepEqual(fs.readFileSync(f.path), f.original);
  await stop(reader.child);
  assert.equal(fs.existsSync(f.lock), true);
});

test("W5 canonical parent aliases share a lock; hard-linked log aliases are rejected", async t => {
  const f = fixture(t);
  const alias = join(f.dir, "alias");
  fs.symlinkSync(join(f.dir, "logs"), alias, process.platform === "win32" ? "junction" : "dir");
  withReceiptWriterLock(f.path, () => {
    assert.throws(() => new ReceiptLog(f.keys, join(alias, "receipts.jsonl")), /writer lock unavailable/);
  });
  const hardlink = join(f.dir, "hardlink.jsonl");
  fs.linkSync(f.path, hardlink);
  assert.throws(() => new ReceiptLog(f.keys, hardlink), /regular file with one link/);
  assert.throws(() => new ReceiptLog(f.keys, f.path), /regular file with one link/);
  assert.deepEqual(fs.readFileSync(f.path), f.original);
  fs.unlinkSync(hardlink);
  new ReceiptLog(f.keys, f.path).create(request, decision);
});

test("W6 ownership replacement fails closed and never deletes replacement lock contents", async t => {
  const f = fixture(t);
  const sync = fs.fsyncSync;
  const mock = t.mock.method(fs, "fsyncSync", (fd: number) => {
    sync(fd);
    fs.renameSync(f.lock, join(f.dir, "original-lock"));
    fs.mkdirSync(f.lock);
    fs.writeFileSync(join(f.lock, "replacement-owner"), "preserve");
  });
  assert.throws(() => f.log.create(request, decision), /persistence failed/);
  mock.mock.restore();
  assert.equal(fs.readFileSync(join(f.lock, "replacement-owner"), "utf8"), "preserve");
  assert.equal(f.log.getAll().length, 1);
  assert.equal(fs.readFileSync(f.path, "utf8").trim().split("\n").length, 2, "Synced receipt may outlive refused response");
  assert.throws(() => f.log.create(request, decision), /operator recovery/);
});

test("W7 lock release failure refuses response and preserves uncertain lock", async t => {
  const f = fixture(t);
  const remove = fs.rmdirSync;
  const mock = t.mock.method(fs, "rmdirSync", (path: fs.PathLike) => {
    if (String(path) === f.lock) throw new Error("injected permission failure");
    return remove(path);
  });
  assert.throws(() => f.log.create(request, decision), /persistence failed/);
  mock.mock.restore();
  assert.equal(f.log.getAll().length, 1);
  assert.equal(fs.existsSync(f.lock), true);
  assert.throws(() => new ReceiptLog(f.keys, f.path), /writer lock unavailable/);
});

test("W8 MCP startup refuses contended log; starts after clean release with trusted checkpoint", async t => {
  const f = fixture(t);
  const anchorPath = join(f.dir, "checkpoint.json");
  fs.writeFileSync(anchorPath, JSON.stringify(createReceiptCheckpoint(f.log.getAll(), f.keys.publicKey)));
  const liveUrl = process.env.BOUNDARY_WRITER_TEST_DATABASE_URL ?? "";
  const env = { ...process.env as Record<string,string>, NODE_ENV: liveUrl ? "production" : "test", DATABASE_URL: liveUrl, BOUNDARY_SKIP_READONLY_PROBE: "", BOUNDARY_POLICY: join(process.cwd(), "policies/example.yaml"), BOUNDARY_CHECKPOINT_PATH: anchorPath, BOUNDARY_KEY_PATH: f.keyPath, BOUNDARY_LOG_PATH: f.path };
  withReceiptWriterLock(f.path, () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/mcp/server.ts"], { env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /writer lock unavailable/);
    assert.equal(result.stdout, "");
    assert.deepEqual(fs.readFileSync(f.path), f.original);
  });
  const c = new Client({ name: "writer-lock", version: "1" });
  try {
    await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "src/mcp/server.ts"], env, stderr: "pipe" }));
    const result = await c.callTool({ name: "boundary_request", arguments: { action: "schema", resource: "*" } });
    const body = JSON.parse((result.content as {text: string}[])[0].text);
    assert.equal(body.ok, true);
    assert.equal(body.dataSource, liveUrl ? "postgres" : "stub");
  } finally { await c.close(); }
  assert.equal(fs.existsSync(f.lock), false);
  t.diagnostic(`MCP lock validation mode=${liveUrl ? "production-postgres" : "development-stub"}`);
});
