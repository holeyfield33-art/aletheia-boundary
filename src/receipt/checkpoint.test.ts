import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ReceiptLog, createReceiptCheckpoint, verifyReceiptChain } from "./log.js";
import { loadReceiptCheckpoint, parseReceiptCheckpoint } from "./checkpoint.js";
import { generateKeyPair, loadOrCreateKeyPair } from "./crypto.js";

const req = { id: "seed", action: "query" as const, resource: "public.synthetic", receivedAt: "test" };
const decision = { outcome: "deny" as const, reason: "checkpoint fixture", decidedAt: "test" };
function fixture(t: { after(fn: () => void): void }) {
  const dir = fs.mkdtempSync(join(tmpdir(), "boundary-checkpoint-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(join(dir, "operator"));
  fs.mkdirSync(join(dir, "logs"));
  const keyPath = join(dir, "key.ed25519");
  const keys = loadOrCreateKeyPair(keyPath);
  const path = join(dir, "logs", "receipts.jsonl");
  const log = new ReceiptLog(keys, path);
  log.create(req, decision);
  const prefix = fs.readFileSync(path);
  log.create({ ...req, id: "anchored" }, decision);
  const full = fs.readFileSync(path);
  const checkpoint = createReceiptCheckpoint(log.getAll(), keys.publicKey);
  const anchorPath = join(dir, "operator", "checkpoint.json");
  fs.writeFileSync(anchorPath, JSON.stringify(checkpoint));
  const pub = join(dir, "key.pub.pem");
  const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "src/receipt/verify-cli.ts", "--log", path, "--pub", pub, ...args], { encoding: "utf8", timeout: 15000 });
  return { dir, path, keyPath, keys, log, prefix, full, checkpoint, anchorPath, pub, cli };
}

test("K1 anchored history accepts exact match and verified extensions", t => {
  const f = fixture(t);
  const log = new ReceiptLog(f.keys, f.path, { checkpoint: loadReceiptCheckpoint(f.anchorPath) });
  log.create({ ...req, id: "extension" }, decision);
  const restarted = new ReceiptLog(f.keys, f.path, { checkpoint: f.checkpoint });
  assert.equal(restarted.getAll().length, 3);
  assert.equal(verifyReceiptChain(restarted.getAll(), f.keys.publicKey).ok, true);
  assert.equal(f.cli("--checkpoint", f.anchorPath).status, 0);
});

test("K2 deletion, empty replacement and valid-prefix rollback refuse without rewriting evidence", t => {
  const f = fixture(t);
  for (const replacement of [null, Buffer.alloc(0), f.prefix]) {
    if (replacement === null) fs.unlinkSync(f.path);
    else fs.writeFileSync(f.path, replacement);
    assert.throws(() => new ReceiptLog(f.keys, f.path, { checkpoint: f.checkpoint }), /checkpoint|Checkpoint/);
    if (replacement === null) assert.equal(fs.existsSync(f.path), false, "Never recreate missing anchored history");
    else assert.deepEqual(fs.readFileSync(f.path), replacement);
  }
  assert.deepEqual(loadReceiptCheckpoint(f.anchorPath), f.checkpoint);
});

test("K3 same-key valid fork, wrong-key anchor and corrupt extensions fail closed", t => {
  const f = fixture(t);
  const fork = new ReceiptLog(f.keys);
  fork.create({ ...req, id: "fork1" }, decision);
  fork.create({ ...req, id: "fork2" }, decision);
  assert.equal(verifyReceiptChain(fork.getAll(), f.keys.publicKey).ok, true);
  fs.writeFileSync(f.path, fork.getAll().map(r => JSON.stringify(r)).join("\n") + "\n");
  assert.throws(() => new ReceiptLog(f.keys, f.path, { checkpoint: f.checkpoint }), /checkpoint/);
  fs.writeFileSync(f.path, f.full);
  const other = generateKeyPair();
  const otherLog = new ReceiptLog(other);
  otherLog.create(req, decision);
  assert.throws(() => new ReceiptLog(f.keys, f.path, { checkpoint: createReceiptCheckpoint(otherLog.getAll(), other.publicKey) }), /key mismatch/);
  fs.appendFileSync(f.path, '{"partial":');
  assert.throws(() => new ReceiptLog(f.keys, f.path, { checkpoint: f.checkpoint }), /Incomplete/);
});

test("K4 strict checkpoint parsing rejects malformed, oversized or unavailable anchors", t => {
  const f = fixture(t);
  for (const bad of [null, {}, { ...f.checkpoint, receiptCount: 0 }, { ...f.checkpoint, receiptCount: 1.5 }, { ...f.checkpoint, receiptCount: Number.MAX_SAFE_INTEGER + 1 }, { ...f.checkpoint, contentHash: "bad" }, { ...f.checkpoint, version: 2 }, { ...f.checkpoint, extra: true }]) {
    assert.throws(() => parseReceiptCheckpoint(bad), /Invalid/);
  }
  for (const text of ["{", " ".repeat(4097), JSON.stringify({ ...f.checkpoint, contentHash: "oops" })]) {
    fs.writeFileSync(f.anchorPath, text);
    assert.throws(() => loadReceiptCheckpoint(f.anchorPath), /unavailable or invalid/);
  }
  fs.unlinkSync(f.anchorPath);
  assert.throws(() => loadReceiptCheckpoint(f.anchorPath), /unavailable or invalid/);
  assert.throws(() => new ReceiptLog(f.keys, undefined, { checkpoint: f.checkpoint }), /existing receipt log/);
});

test("K5 export verifies before producing a candidate and never overwrites files", t => {
  const f = fixture(t);
  const out = join(f.dir, "operator", "candidate.json");
  assert.equal(f.cli("--checkpoint", f.anchorPath, "--export-checkpoint", out).status, 0);
  assert.deepEqual(loadReceiptCheckpoint(out), f.checkpoint);
  const saved = fs.readFileSync(out);
  assert.equal(f.cli("--export-checkpoint", out).status, 1);
  assert.deepEqual(fs.readFileSync(out), saved);
  assert.equal(f.cli("--export-checkpoint", f.path).status, 1);
  assert.deepEqual(fs.readFileSync(f.path), f.full);
  fs.writeFileSync(f.path, f.full.toString().replace('"checkpoint fixture"', '"forged"'));
  const invalidOut = join(f.dir, "operator", "invalid.json");
  assert.equal(f.cli("--export-checkpoint", invalidOut).status, 1);
  assert.equal(fs.existsSync(invalidOut), false);
  assert.throws(() => createReceiptCheckpoint([], f.keys.publicKey), /empty or invalid/);
});

test("K6 offline anchored verification rejects empty, rolled-back and missing history", t => {
  const f = fixture(t);
  for (const bytes of [Buffer.alloc(0), f.prefix]) {
    fs.writeFileSync(f.path, bytes);
    assert.equal(f.cli("--checkpoint", f.anchorPath).status, 1);
    assert.deepEqual(fs.readFileSync(f.path), bytes);
  }
  fs.unlinkSync(f.path);
  assert.equal(f.cli("--checkpoint", f.anchorPath).status, 1);
  assert.equal(fs.existsSync(f.path), false);
});

test("K7 production requires explicit checkpoint configuration before opening a DB", t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/mcp/server.ts"], { env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgres://invalid", BOUNDARY_SKIP_READONLY_PROBE: "", BOUNDARY_CHECKPOINT_PATH: "", BOUNDARY_KEY_PATH: f.keyPath, BOUNDARY_LOG_PATH: f.path }, encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Production requires BOUNDARY_CHECKPOINT_PATH/);
  assert.deepEqual(fs.readFileSync(f.path), f.full);
});

test("K8 MCP anchored startup succeeds; deleted/rolled-back history and missing anchor refuse", async t => {
  const f = fixture(t);
  const liveUrl = process.env.BOUNDARY_CHECKPOINT_TEST_DATABASE_URL ?? "";
  const env = { ...process.env as Record<string,string>, NODE_ENV: liveUrl ? "production" : "test", DATABASE_URL: liveUrl, BOUNDARY_SKIP_READONLY_PROBE: "", BOUNDARY_CHECKPOINT_PATH: f.anchorPath, BOUNDARY_KEY_PATH: f.keyPath, BOUNDARY_LOG_PATH: f.path };
  const c = new Client({ name: "checkpoint-test", version: "1" });
  try {
    await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "src/mcp/server.ts"], env, stderr: "pipe" }));
    const response = await c.callTool({ name: "boundary_request", arguments: { action: "schema", resource: "*" } });
    const body = JSON.parse((response.content as {text: string}[])[0].text);
    assert.equal(body.ok, true);
    assert.equal(body.dataSource, liveUrl ? "postgres" : "stub");
  } finally { await c.close(); }
  const start = () => spawnSync(process.execPath, ["--import", "tsx", "src/mcp/server.ts"], { env, encoding: "utf8", timeout: 15000 });
  fs.writeFileSync(f.path, f.prefix);
  assert.equal(start().status, 1);
  assert.deepEqual(fs.readFileSync(f.path), f.prefix);
  fs.unlinkSync(f.path);
  assert.equal(start().status, 1);
  assert.equal(fs.existsSync(f.path), false);
  fs.writeFileSync(f.path, f.full);
  fs.unlinkSync(f.anchorPath);
  assert.equal(start().status, 1);
  assert.deepEqual(fs.readFileSync(f.path), f.full);
  t.diagnostic(`MCP anchored startup/refusal mode=${liveUrl ? "production-postgres" : "development-stub"}`);
});

test("K9 freshness limit: old floor permits suffix removal; advanced checkpoint detects it", t => {
  const f = fixture(t);
  f.log.create({ ...req, id: "unanchored-suffix" }, decision);
  const advanced = createReceiptCheckpoint(f.log.getAll(), f.keys.publicKey);
  fs.writeFileSync(f.path, f.full);
  assert.equal(new ReceiptLog(f.keys, f.path, { checkpoint: f.checkpoint }).getAll().length, 2);
  assert.throws(() => new ReceiptLog(f.keys, f.path, { checkpoint: advanced }), /shorter than trusted checkpoint/);
  t.diagnostic("Rollback is detected only through the independently retained checkpoint; unanchored suffix loss remains a documented limit");
});

test("K10 CLI rejects missing/unknown checkpoint arguments rather than disabling checks", t => {
  const f = fixture(t);
  assert.equal(f.cli("--checkpoint").status, 2);
  assert.equal(f.cli("--checkpont", f.anchorPath).status, 2);
  assert.equal(f.cli("--checkpoint", f.anchorPath, "--checkpoint", f.anchorPath).status, 2);
});
