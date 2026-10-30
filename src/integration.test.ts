/**
 * Live Postgres integration test for Aletheia Boundary.
 *
 * Requires:
 *   docker compose up -d
 *   export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
 *
 * Optional:
 *   export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary
 *
 * Run: npx tsx src/integration.test.ts
 */

import pg from "pg";
import { Boundary } from "./boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "./policy/engine.js";
import { ReceiptLog } from "./receipt/log.js";
import { generateKeyPair, verifyHash } from "./receipt/crypto.js";
import {
  PostgresProvider,
  assertReadOnlyRole,
} from "./data/postgres.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://readonly:readonly@localhost:5434/boundary";
const DATABASE_URL_WRITABLE = process.env.DATABASE_URL_WRITABLE;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  console.log(
    "[integration] connecting to",
    DATABASE_URL.replace(/:[^:@]+@/, ":***@"),
  );

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  await assertReadOnlyRole(pool);
  console.log("[ok] read-only probe accepted");

  if (DATABASE_URL_WRITABLE) {
    const wpool = new pg.Pool({
      connectionString: DATABASE_URL_WRITABLE,
      max: 1,
    });
    let refused = false;
    try {
      await assertReadOnlyRole(wpool);
    } catch {
      refused = true;
    } finally {
      await wpool.end();
    }
    assert(refused, "writable role must be refused by probe");
    console.log("[ok] writable role refused by probe");
  } else {
    console.log(
      "[skip] DATABASE_URL_WRITABLE not set — probe refuse test skipped",
    );
  }

  const policy = new PolicyEngine(
    loadPolicyFromObject({
      version: "0.1",
      defaultEffect: "deny",
      rules: [
        {
          id: "allow-schema",
          match: { action: "schema" },
          effect: "allow",
          priority: 10,
        },
        {
          id: "deny-users",
          match: { resource: ["*users*", "public.users"] },
          effect: "deny",
          reason: "users table is PII",
          priority: 100,
        },
        {
          id: "allow-orders-sample",
          match: { action: "sample", resource: "public.orders" },
          effect: "allow_with_constraints",
          constraints: [
            { type: "limit", value: 10 },
            { type: "redact", value: ["email"] },
          ],
          priority: 20,
        },
        {
          id: "allow-analytics-query",
          match: {
            action: "query",
            resource: ["public.analytics_daily", "analytics_daily"],
          },
          effect: "allow_with_constraints",
          constraints: [
            {
              type: "columns",
              value: ["date", "metric", "value", "segment"],
            },
            { type: "limit", value: 100 },
          ],
          priority: 30,
        },
        {
          id: "allow-orders-query",
          match: { action: "query", resource: "public.orders" },
          effect: "allow_with_constraints",
          constraints: [{ type: "limit", value: 50 }],
          priority: 25,
        },
      ],
    }),
  );

  const provider = new PostgresProvider({
    pool,
    identity: "integration-test",
    maxRows: 1000,
    requireReadOnlyRole: false,
  });
  await provider.init();

  const keyPair = generateKeyPair();
  const log = new ReceiptLog(keyPair);
  const boundary = new Boundary(policy, provider, log);

  // 1. Schema allowed
  {
    const r = await boundary.handle({ action: "schema", resource: "*" });
    assert(r.ok, "schema must be allowed");
    assert(Array.isArray(r.payload?.data), "schema data is array");
    const tables = r.payload!.data as { name: string }[];
    assert(
      tables.some((t) => t.name === "orders"),
      "orders table present in schema",
    );
    assert(
      verifyHash(keyPair.publicKey, r.receipt.contentHash, r.receipt.signature),
      "schema receipt verifies",
    );
    console.log("[ok] schema allowed, receipt verifies");
  }

  // 2. users denied by policy (structured; no SQL)
  {
    const r = await boundary.handle({
      action: "query",
      resource: "public.users",
    });
    assert(!r.ok, "users must be denied");
    assert(r.decision.outcome === "deny", "outcome is deny");
    console.log("[ok] users denied by policy");
  }

  // 3. free-form SQL rejected even on an allowed resource (F1)
  {
    const r = await boundary.handle({
      action: "query",
      resource: "public.orders",
      params: { sql: "SELECT * FROM public.users" },
    });
    assert(!r.ok, "agent SQL must be rejected");
    assert(
      (r.error ?? r.decision.reason).includes("free-form SQL") ||
        (r.error ?? r.decision.reason).includes("not allowed"),
      "reason mentions free-form SQL",
    );
    console.log("[ok] free-form SQL rejected:", (r.error ?? "").slice(0, 80));
  }

  // 4. sample orders + constraints
  {
    const r = await boundary.handle({
      action: "sample",
      resource: "public.orders",
    });
    assert(r.ok, "orders sample must be allowed");
    const data = r.payload!.data as {
      rows: Record<string, unknown>[];
      rowCount: number;
    };
    assert(data.rowCount > 0, "got rows");
    assert(data.rowCount <= 10, "limit constraint applied");
    console.log(
      `[ok] sample orders: ${data.rowCount} rows, transforms=${r.payload!.transforms.join(",")}`,
    );
  }

  // 5. structured analytics query with column projection
  {
    const r = await boundary.handle({
      action: "query",
      resource: "public.analytics_daily",
    });
    assert(r.ok, "analytics query must be allowed");
    const data = r.payload!.data as { rows: Record<string, unknown>[] };
    assert(data.rows.length > 0, "got analytics rows");
    for (const row of data.rows) {
      for (const k of Object.keys(row)) {
        assert(
          ["date", "metric", "value", "segment"].includes(k),
          `unexpected column leaked: ${k}`,
        );
      }
    }
    console.log(
      `[ok] analytics query minimized: ${data.rows.length} rows, transforms=${r.payload!.transforms.join(",")}`,
    );
  }

  // 6. structured orders query (seed columns: id, user_id, status, amount)
  {
    const r = await boundary.handle({
      action: "query",
      resource: "public.orders",
      params: { columns: ["id", "amount"] },
    });
    assert(
      r.ok,
      `orders query must be allowed: ${r.error ?? r.decision.reason}`,
    );
    const data = r.payload!.data as { rows: Record<string, unknown>[] };
    assert(data.rows.length > 0, "got order rows");
    for (const row of data.rows) {
      for (const k of Object.keys(row)) {
        assert(["id", "amount"].includes(k), `unexpected column: ${k}`);
      }
    }
    console.log(
      `[ok] structured orders query: ${data.rows.length} rows, transforms=${r.payload!.transforms.join(",")}`,
    );
  }

  // 7. write canary still empty
  {
    const client = await pool.connect();
    try {
      const res = await client.query(
        "SELECT count(*)::int AS n FROM public.write_canary",
      );
      assert(res.rows[0].n === 0, "write_canary must be empty");
      console.log("[ok] write_canary empty — no unauthorized writes");
    } finally {
      client.release();
    }
  }

  // 8. hash chain
  {
    const all = log.getAll();
    assert(all.length >= 5, "enough receipts");
    for (let i = 1; i < all.length; i++) {
      assert(
        all[i].prevHash === all[i - 1].contentHash,
        `hash chain broken at index ${i}`,
      );
      assert(
        verifyHash(keyPair.publicKey, all[i].contentHash, all[i].signature),
        `signature invalid at index ${i}`,
      );
    }
    console.log(`[ok] hash chain intact across ${all.length} receipts`);
  }

  await pool.end();
  console.log("\nAll integration checks passed.");
}

main().catch((e) => {
  console.error("\nINTEGRATION FAILED:", e);
  process.exit(1);
});
