/**
 * Formal agent review — SDLC §5 checklist.
 *
 * Drives the MCP server as an agent would (stdio MCP client), grades each
 * checklist row from the tool result alone, exits non-zero on any FAIL.
 *
 * Usage:
 *   npx tsx audit/agent-review.ts
 *   DATABASE_URL=... npx tsx audit/agent-review.ts --write-report
 */

import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicKey } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { verifyHash } from "../src/receipt/crypto.js";

type Grade = "PASS" | "FAIL" | "SKIP";

interface CheckResult {
  id: string;
  name: string;
  grade: Grade;
  evidence: string;
}

interface ToolBody {
  ok?: boolean;
  decision?: {
    outcome?: string;
    reason?: string;
    ruleId?: string;
  };
  data?: unknown;
  transforms?: string[];
  stats?: { rows?: number; truncated?: boolean; bytes?: number };
  dataSource?: string;
  receipt?: {
    id?: string;
    contentHash?: string;
    signature?: string;
    prevHash?: string | null;
    keyId?: string;
    createdAt?: string;
  };
  error?: string;
}

function parseToolText(content: unknown): ToolBody {
  const blocks = content as { type: string; text?: string }[];
  const text = blocks?.find((b) => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text) as ToolBody;
  } catch {
    return { error: `non-JSON tool text: ${text.slice(0, 200)}` };
  }
}

async function callBoundary(
  client: Client,
  args: Record<string, unknown>,
): Promise<{ body: ToolBody; isError?: boolean }> {
  const res = await client.callTool({
    name: "boundary_request",
    arguments: args,
  });
  return {
    body: parseToolText(res.content),
    isError: Boolean((res as { isError?: boolean }).isError),
  };
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "aletheia-agent-review-"));
  const keyPath = join(work, "boundary.ed25519");
  const logPath = join(work, "receipts.jsonl");
  const policyPath = resolve(process.cwd(), "policies/example.yaml");

  const env: Record<string, string> = {
    ...process.env,
    BOUNDARY_KEY_PATH: keyPath,
    BOUNDARY_LOG_PATH: logPath,
    BOUNDARY_POLICY: policyPath,
  };
  const live = Boolean(process.env.DATABASE_URL);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/mcp/server.ts"],
    cwd: process.cwd(),
    env,
    stderr: "pipe",
  });

  const client = new Client({ name: "agent-review", version: "0.0.1" });
  await client.connect(transport);

  const results: CheckResult[] = [];
  const grade = (id: string, name: string, pass: boolean, evidence: string) => {
    results.push({ id, name, grade: pass ? "PASS" : "FAIL", evidence });
  };

  const listed = await client.listTools();
  const hasTool = listed.tools.some((t) => t.name === "boundary_request");
  grade(
    "C0",
    "MCP exposes boundary_request",
    hasTool,
    hasTool
      ? `tools=${listed.tools.map((t) => t.name).join(",")}`
      : "boundary_request missing",
  );

  {
    const { body } = await callBoundary(client, {
      action: "query",
      resource: "public.users",
    });
    const reason = body.decision?.reason || body.error || "";
    const pass =
      body.ok === false &&
      typeof reason === "string" &&
      reason.length > 0 &&
      (body.decision?.outcome === "deny" || Boolean(body.error));
    grade(
      "C1",
      "Errors carry reasons",
      pass,
      `ok=${body.ok} outcome=${body.decision?.outcome} reason=${reason.slice(0, 120)}`,
    );
  }

  {
    const { body } = await callBoundary(client, {
      action: "schema",
      resource: "*",
    });
    const ds = body.dataSource;
    const expected = live ? "postgres" : "stub";
    grade(
      "C2",
      "Real or fake is visible (dataSource)",
      ds === expected,
      `dataSource=${ds} expected=${expected} live=${live}`,
    );
  }

  {
    if (live) {
      const { body } = await callBoundary(client, {
        action: "query",
        resource: "public.orders",
        params: { limit: 50_000 },
      });
      const rows =
        body.stats?.rows ??
        (body.data as { rowCount?: number; rows?: unknown[] })?.rowCount ??
        (body.data as { rows?: unknown[] })?.rows?.length ??
        -1;
      const pass =
        body.ok === true &&
        typeof rows === "number" &&
        rows >= 0 &&
        rows <= 2000 &&
        (body.transforms ?? []).some((t) => t.startsWith("limit:"));
      grade(
        "C3",
        "Bounded output",
        pass,
        `ok=${body.ok} rows=${rows} transforms=${(body.transforms ?? []).join(",")}`,
      );
    } else {
      results.push({
        id: "C3",
        name: "Bounded output",
        grade: "SKIP",
        evidence: "requires DATABASE_URL (stub path has fixed 2 rows)",
      });
    }
  }

  {
    const { body } = await callBoundary(client, {
      action: "schema",
      resource: "*",
    });
    const pass =
      body.ok === true &&
      typeof body.decision?.reason === "string" &&
      body.decision.reason.length > 0 &&
      Array.isArray(body.transforms);
    grade(
      "C4",
      "Declared scope (rule/reason + transforms)",
      pass,
      `ruleId=${body.decision?.ruleId} reason=${(body.decision?.reason ?? "").slice(0, 80)} transforms=${(body.transforms ?? []).join(",")}`,
    );
  }

  {
    if (live) {
      // Seed has 4 orders; limit 2 must return 2 rows AND stats.truncated=true
      const { body } = await callBoundary(client, {
        action: "query",
        resource: "public.orders",
        params: { limit: 2 },
      });
      const rows =
        (body.data as { rows?: unknown[] })?.rows?.length ?? body.stats?.rows ?? 0;
      const pass =
        body.ok === true && rows === 2 && body.stats?.truncated === true;
      grade(
        "C5",
        "Honest completion (limit/truncation visible)",
        pass,
        `rows=${rows} truncated=${body.stats?.truncated} transforms=${(body.transforms ?? []).join(",")}`,
      );
    } else {
      results.push({
        id: "C5",
        name: "Honest completion (limit/truncation visible)",
        grade: "SKIP",
        evidence: "requires DATABASE_URL",
      });
    }
  }

  {
    const { body } = await callBoundary(client, {
      action: "query",
      resource: "public.orders",
      params: { sql: "SELECT 1; DROP TABLE public.users" },
    });
    const reason = `${body.error ?? ""} ${body.decision?.reason ?? ""}`;
    const pass =
      body.ok === false &&
      (reason.includes("free-form SQL") || reason.includes("not allowed"));
    grade(
      "C6",
      "Input handling (malformed/SQL clean refusal)",
      pass,
      `ok=${body.ok} reason=${reason.slice(0, 140)}`,
    );
  }

  {
    const a = await callBoundary(client, { action: "schema", resource: "*" });
    const b = await callBoundary(client, { action: "schema", resource: "*" });
    const da = JSON.stringify(a.body.data);
    const db = JSON.stringify(b.body.data);
    const pass =
      a.body.ok === true &&
      b.body.ok === true &&
      da === db &&
      a.body.decision?.outcome === b.body.decision?.outcome;
    grade(
      "C7",
      "Repeatability",
      pass,
      `sameData=${da === db} outcomes=${a.body.decision?.outcome}/${b.body.decision?.outcome}`,
    );
  }

  {
    const { body } = await callBoundary(client, {
      action: "schema",
      resource: "*",
    });
    const r = body.receipt;
    let pass = false;
    let evidence = "no receipt";
    if (r?.contentHash && r.signature && r.keyId) {
      const pubPath = keyPath.replace(/\.ed25519$/, "") + ".pub.pem";
      if (existsSync(pubPath)) {
        const pub = createPublicKey(readFileSync(pubPath, "utf8"));
        const sigOk = verifyHash(pub, r.contentHash, r.signature);
        pass = sigOk && r.contentHash.length === 64;
        evidence = `sigOk=${sigOk} keyId=${r.keyId} hash=${r.contentHash.slice(0, 16)}…`;
      } else {
        evidence = `pub key missing at ${pubPath}`;
      }
    }
    grade("C8", "Evidence (receipt signature verifies)", pass, evidence);
  }

  {
    try {
      const res = await client.callTool({
        name: "not_a_tool",
        arguments: {},
      });
      const pass = Boolean((res as { isError?: boolean }).isError);
      grade(
        "C9",
        "Unknown tool refused",
        pass,
        `isError=${(res as { isError?: boolean }).isError}`,
      );
    } catch (e) {
      grade(
        "C9",
        "Unknown tool refused",
        true,
        `client threw: ${String(e).slice(0, 80)}`,
      );
    }
  }

  await client.close();
  console.log(`Receipt verification artifacts: ${work}`);
  const verification = spawnSync(process.execPath, ["--import", "tsx", "src/receipt/verify-cli.ts", "--log", logPath, "--pub", keyPath.replace(/\.ed25519$/, "") + ".pub.pem"], { encoding: "utf8", timeout: 15000 });
  grade("C10", "Offline persisted receipt chain (G6)", verification.status === 0,
    (verification.stdout || verification.stderr || String(verification.error)).trim());

  console.log("\n=== AGENT REVIEW (SDLC §5) ===");
  console.log(`mode: ${live ? "postgres" : "stub"}`);
  console.log(`package: aletheia-boundary agent-review`);
  for (const r of results) {
    console.log(`${r.grade.padEnd(4)}  ${r.id}  ${r.name}`);
    console.log(`      ${r.evidence}`);
  }
  const fails = results.filter((r) => r.grade === "FAIL").length;
  const passes = results.filter((r) => r.grade === "PASS").length;
  const skips = results.filter((r) => r.grade === "SKIP").length;
  console.log(JSON.stringify({ pass: passes, fail: fails, skip: skips, live }));

  if (process.argv.includes("--write-report")) {
    const day = new Date().toISOString().slice(0, 10);
    const dir = resolve(process.cwd(), "docs");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `AGENT-REVIEW-${day}.md`);
    const lines = [
      `# Agent review — ${day}`,
      "",
      `Mode: **${live ? "postgres (DATABASE_URL set)" : "stub (no DATABASE_URL)"}**`,
      "",
      "Graded from MCP tool results only (SDLC §5).",
      "",
      "| ID | Check | Grade | Evidence |",
      "|---|---|---|---|",
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.name} | **${r.grade}** | ${r.evidence.replace(/\|/g, "\\|")} |`,
      ),
      "",
      `Summary: **${passes} PASS**, **${fails} FAIL**, **${skips} SKIP**`,
      "",
      fails === 0
        ? "No open checklist failures in this run."
        : "Failures must be fixed before calling the agent review complete.",
      "",
    ];
    writeFileSync(path, lines.join("\n"), "utf8");
    console.log(`report written: ${path}`);
  }

  process.exitCode = fails > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("AGENT REVIEW FAILED TO RUN:", e);
  process.exit(2);
});
