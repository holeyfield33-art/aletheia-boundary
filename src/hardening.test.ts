import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Boundary } from "./boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "./policy/engine.js";
import { ReceiptLog, verifyReceiptChain } from "./receipt/log.js";
import { generateKeyPair } from "./receipt/crypto.js";
import type { DataProvider } from "./data/provider.js";

const keys = generateKeyPair();
const request = { id: "r", action: "query" as const, resource: "public.orders", receivedAt: "now" };
const decision = { outcome: "allow" as const, reason: "test", decidedAt: "now" };
const policy = (rules: unknown[] = []) => new PolicyEngine(loadPolicyFromObject({ version: "1", defaultEffect: "deny", rules }));
const allow = policy([{ id: "all", match: {}, effect: "allow" }]);
const provider: DataProvider = { async execute() { return { data: "SYNTHETIC_DATA", transforms: [] }; } };
function fixture(t: { after(fn: () => void): void }) {
  const dir = fs.mkdtempSync(join(tmpdir(), "boundary-hardening-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, path: join(dir, "receipts.jsonl") };
}

test("H1 append and fsync failures release no data, leave memory unchanged, poison writer", async t => {
  for (const kind of ["write", "short", "sync"] as const) {
    const { path } = fixture(t);
    const log = new ReceiptLog(keys, path);
    const first = log.create(request, decision);
    const method = kind === "sync" ? "fsyncSync" : "writeSync";
    const originalWrite = fs.writeSync;
    const mock = t.mock.method(fs, method, (...args: unknown[]) => {
      if (kind === "short") {
        const [fd, bytes, offset, , position] = args as [number, Buffer, number, number, number];
        return originalWrite(fd, bytes, offset, 1, position);
      }
      throw new Error("ENOSPC / SYNTHETIC_SECRET");
    });
    await assert.rejects(new Boundary(allow, provider, log).handle(request), /persistence failed/);
    assert.equal(log.getAll().length, 1);
    assert.equal(log.getLastHash(), first.contentHash);
    mock.mock.restore();
    assert.throws(() => log.create(request, decision), /operator recovery/);
    if (kind === "short") assert.throws(() => new ReceiptLog(keys, path), /Incomplete/);
  }
});

test("H2 restart verifies; partial, tampered and wrong-key logs refuse recovery", t => {
  const { path } = fixture(t);
  const a = new ReceiptLog(keys, path);
  a.create(request, decision);
  const b = new ReceiptLog(keys, path);
  b.create(request, decision);
  assert.equal(verifyReceiptChain(b.getAll(), keys.publicKey).ok, true);
  const good = fs.readFileSync(path, "utf8");
  assert.throws(() => new ReceiptLog(generateKeyPair(), path));
  assert.throws(() => new ReceiptLog(keys, path, { verifyOnLoad: false }));
  for (const bad of [good.slice(0, -1), good + '{"partial":', good.replace('"reason":"test"', '"reason":"forged"')]) {
    fs.writeFileSync(path, bad);
    assert.throws(() => new ReceiptLog(keys, path));
  }
});

test("H3 deletion, truncation and same-size edits while serving refuse append", t => {
  for (const kind of ["delete", "truncate", "edit"]) {
    const { path } = fixture(t);
    const log = new ReceiptLog(keys, path);
    log.create(request, decision);
    if (kind === "delete") fs.unlinkSync(path);
    else if (kind === "truncate") fs.writeFileSync(path, "");
    else fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace('"test"', '"evil"'));
    assert.throws(() => log.create(request, decision), /persistence failed/);
    assert.equal(log.getAll().length, 1);
  }
});

test("H4 concurrent handles serialize a verifiable persisted chain; callers cannot mutate it", async t => {
  const { path } = fixture(t);
  const log = new ReceiptLog(keys, path);
  const b = new Boundary(allow, provider, log);
  const results = await Promise.all(Array.from({ length: 20 }, () => b.handle(request)));
  results[0].receipt.decision.reason = "mutated";
  assert.equal(verifyReceiptChain(log.getAll(), keys.publicKey).ok, true);
  assert.equal(new ReceiptLog(keys, path).getAll().length, 20);
  const mutable = { ...request, params: { limit: 1 } };
  log.create(mutable, decision);
  mutable.params.limit = 999;
  assert.equal(verifyReceiptChain(log.getAll(), keys.publicKey).ok, true);
});

test("H5 schema projects intersection of read and schema constraints and hides redacted names", async () => {
  const p = policy([
    { id: "schema", match: { action: "schema" }, effect: "allow_with_constraints", constraints: [{type: "columns", value: ["id", "email", "ssn"]}] },
    { id: "query", match: { action: "query", resource: "public.orders" }, effect: "allow_with_constraints", constraints: [{type: "columns", value: ["id", "email"]}, {type: "redact", value: ["email"]}] },
  ]);
  const source = [{ schema: "public", name: "orders", columns: ["id", "email", "ssn"].map(name => ({ name, type: "text", nullable: false })), internal: "SYNTHETIC_SECRET" }, { schema: "private", name: "denied", columns: [] }];
  const r = await new Boundary(p, { async execute() { return { data: source, transforms: [] }; } }, new ReceiptLog(keys)).handle({ action: "schema", resource: "*" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.payload?.data, [{ schema: "public", name: "orders", columns: [{ name: "id", type: "text", nullable: false }] }]);
  assert.equal(source[0].columns.length, 3, "cache must remain unchanged");
});

test("H6 provider and policy exceptions omit secrets from result and signed receipt", async () => {
  for (const where of ["policy", "provider"]) {
    const p = policy();
    if (where === "policy") p.evaluate = () => { throw new Error("postgres://secret:password@private/secret"); };
    const r = await new Boundary(where === "policy" ? p : allow, { async execute() { throw new Error("postgres://secret:password@private/secret"); } }, new ReceiptLog(keys)).handle(request);
    assert.equal(r.ok, false);
    assert.equal(r.payload, undefined);
    assert.doesNotMatch(JSON.stringify(r), /password|postgres:\/\/|private/);
    assert.equal(verifyReceiptChain([r.receipt], keys.publicKey).ok, true);
  }
});

test("H7 production refuses missing DB and probe bypass before connecting", () => {
  for (const env of [{ DATABASE_URL: "", BOUNDARY_SKIP_READONLY_PROBE: "" }, { DATABASE_URL: "postgres://invalid", BOUNDARY_SKIP_READONLY_PROBE: "1" }]) {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/mcp/server.ts"], { env: { ...process.env, NODE_ENV: "production", ...env }, encoding: "utf8", timeout: 15000 });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /Production (requires DATABASE_URL|cannot bypass)/);
  }
});

test("H8 MCP caller spoofing fails; host identity wins; receipt failure is sanitized", async t => {
  const { dir, path } = fixture(t);
  const pp = join(dir, "policy.json");
  fs.writeFileSync(pp, JSON.stringify({ version: "1", defaultEffect: "deny", rules: [{ id: "host", match: { caller: "trusted" }, effect: "allow" }] }));
  for (const trusted of ["", "trusted"]) {
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "src/mcp/server.ts"], env: { ...process.env as Record<string,string>, NODE_ENV: "test", DATABASE_URL: "", BOUNDARY_CHECKPOINT_PATH: "", BOUNDARY_POLICY: pp, BOUNDARY_TRUSTED_CALLER: trusted, BOUNDARY_KEY_PATH: join(dir, "key.ed25519"), BOUNDARY_LOG_PATH: path }, stderr: "pipe" });
    const c = new Client({ name: "hardening", version: "1" });
    try {
      await c.connect(transport);
      const response = await c.callTool({ name: "boundary_request", arguments: { action: "query", resource: "public.orders", caller: trusted ? "attacker" : "trusted", purpose: "trusted" } });
      const body = JSON.parse((response.content as {text: string}[])[0].text);
      assert.equal(body.ok, Boolean(trusted));
      const receipt = JSON.parse(fs.readFileSync(path, "utf8").trim().split("\n").at(-1)!);
      assert.equal(receipt.request.caller, trusted);
      if (trusted) {
        fs.unlinkSync(path);
        const failed = await c.callTool({ name: "boundary_request", arguments: { action: "query", resource: "public.orders" } });
        assert.equal(failed.isError, true);
        const text = (failed.content as {text: string}[])[0].text;
        assert.deepEqual(JSON.parse(text), { ok: false, data: null, error: "Receipt unavailable; request refused" });
        assert.doesNotMatch(text, /SYNTHETIC_DATA|ENOENT|receipts.jsonl/);
      }
    } finally { await c.close(); }
  }
});

test("H9 offline verifier rejects incomplete tail and validates full log", t => {
  const { dir, path } = fixture(t);
  new ReceiptLog(keys, path).create(request, decision);
  const pub = join(dir, "public.pem");
  fs.writeFileSync(pub, keys.publicKey.export({ type: "spki", format: "pem" }));
  const verify = () => spawnSync(process.execPath, ["--import", "tsx", "src/receipt/verify-cli.ts", "--log", path, "--pub", pub], { encoding: "utf8", timeout: 15000 });
  assert.equal(verify().status, 0);
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").trimEnd());
  assert.equal(verify().status, 1);
});

test("H10 schema enumeration honors initial constraints as well as table rules", async () => {
  const p = policy([
    { id: "list", match: { action: "schema", resource: "public" }, effect: "allow_with_constraints", constraints: [{ type: "columns", value: ["id"] }] },
    { id: "table", match: { action: ["schema", "sample", "query"], resource: "public.orders" }, effect: "allow" },
  ]);
  const r = await new Boundary(p, { async execute() { return { data: [{ schema: "public", name: "orders", columns: [{ name: "id" }, { name: "secret" }] }], transforms: ["schema"], stats: { rows: 99, bytes: 999 } }; } }, new ReceiptLog(keys)).handle({ action: "schema", resource: "public" });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r.payload), /secret|999|99|schema-filtered:/);
  assert.equal(r.payload?.stats?.bytes, Buffer.byteLength(JSON.stringify(r.payload?.data)));
});
