#!/usr/bin/env node
/**
 * Aletheia Boundary MCP server.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import YAML from "yaml";

import { Boundary } from "../boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../policy/engine.js";
import { ReceiptLog } from "../receipt/log.js";
import { loadReceiptCheckpoint } from "../receipt/checkpoint.js";
import { loadOrCreateKeyPair } from "../receipt/crypto.js";
import { StubProvider } from "../data/provider.js";
import type { DataProvider } from "../data/provider.js";

const PACKAGE_VERSION = "0.0.10";

function loadPolicy(): PolicyEngine {
  const path =
    process.env.BOUNDARY_POLICY ??
    resolve(process.cwd(), "policies/example.yaml");
  try {
    const raw = readFileSync(path, "utf8");
    const doc = loadPolicyFromObject(YAML.parse(raw));
    return new PolicyEngine(doc);
  } catch (err) {
    console.error(
      `[aletheia-boundary] FATAL: failed to load policy from ${path}: ${err}`,
    );
    process.exit(1);
  }
}

async function createProvider(): Promise<{
  provider: DataProvider;
  isStub: boolean;
}> {
  if (process.env.NODE_ENV === "production" && process.env.BOUNDARY_SKIP_READONLY_PROBE === "1") {
    throw new Error("Production cannot bypass read-only verification");
  }
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    throw new Error("Production requires DATABASE_URL");
  }
  if (process.env.NODE_ENV === "production" && !process.env.BOUNDARY_CHECKPOINT_PATH) {
    throw new Error("Production requires BOUNDARY_CHECKPOINT_PATH");
  }
  if (process.env.DATABASE_URL) {
    try {
      const { createPostgresProviderFromEnv } = await import(
        "../data/postgres.js"
      );
      const provider = await createPostgresProviderFromEnv();
      console.error(
        "[aletheia-boundary] Postgres provider ready (read-only probe passed)",
      );
      return { provider, isStub: false };
    } catch (err) {
      console.error(
        `[aletheia-boundary] FATAL: Postgres provider failed (refusing to start): ${err}`,
      );
      process.exit(1);
    }
  }

  console.error(
    "[aletheia-boundary] No DATABASE_URL — using StubProvider (dev only; data is not real)",
  );
  return { provider: new StubProvider(), isStub: true };
}

async function main() {
  const policy = loadPolicy();
  const { provider, isStub } = await createProvider();

  const keyPath =
    process.env.BOUNDARY_KEY_PATH ??
    resolve(process.cwd(), "keys/boundary.ed25519");
  const keyPair = loadOrCreateKeyPair(keyPath);
  console.error(`[aletheia-boundary] Signing key: ${keyPair.keyId}`);

  const logPath =
    process.env.BOUNDARY_LOG_PATH ??
    resolve(process.cwd(), "logs/receipts.jsonl");
  const checkpointPath = process.env.BOUNDARY_CHECKPOINT_PATH;
  const checkpoint = checkpointPath ? loadReceiptCheckpoint(checkpointPath) : undefined;
  const log = new ReceiptLog(keyPair, logPath, { checkpoint });
  console.error(`[aletheia-boundary] Trusted receipt checkpoint: ${checkpoint ? "verified" : "not configured (dev only)"}`);
  console.error(
    `[aletheia-boundary] Receipt log: ${logPath} (${log.getAll().length} existing)`,
  );

  const boundary = new Boundary(policy, provider, log);

  const server = new Server(
    {
      name: "aletheia-boundary",
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "boundary_request",
        description:
          "Request data through the local Aletheia Boundary. " +
          "Policy is evaluated on the resource (table). " +
          "Free-form SQL is not accepted; the boundary builds the statement. " +
          "All releases are minimized and receipted. Schema omits denied tables and restricted columns. " +
          "stats.truncated is true when more rows existed than the applied limit.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["query", "schema", "export", "sample"],
              description: "Type of data access requested",
            },
            resource: {
              type: "string",
              description:
                "Table identifier the policy matches and the boundary will read (e.g. public.orders).",
            },
            params: {
              type: "object",
              description:
                "Structured only. Optional: columns (string[]), limit (number). params.sql is rejected.",
              properties: {
                columns: {
                  type: "array",
                  items: { type: "string" },
                },
                limit: { type: "number" },
              },
            },
            purpose: { type: "string" },
            caller: { type: "string", description: "Ignored; identity is configured by the host" },
          },
          required: ["action", "resource"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "boundary_request") {
      return {
        content: [{ type: "text", text: "Unknown tool" }],
        isError: true,
      };
    }

    const args = (req.params.arguments ?? {}) as {
      action: "query" | "schema" | "export" | "sample";
      resource: string;
      params?: Record<string, unknown>;
      purpose?: string;
      caller?: string;
    };

    try {
      const result = await boundary.handle({
        action: args.action,
        resource: args.resource,
        params: args.params,
        purpose: args.purpose,
        caller: process.env.BOUNDARY_TRUSTED_CALLER,
      });

      const body = {
        ok: result.ok,
        decision: result.decision,
        data: result.payload?.data ?? null,
        transforms: result.payload?.transforms ?? [],
        stats: result.payload?.stats,
        dataSource: isStub ? "stub" : "postgres",
        receipt: {
          id: result.receipt.id,
          contentHash: result.receipt.contentHash,
          signature: result.receipt.signature,
          prevHash: result.receipt.prevHash,
          keyId: result.receipt.keyId,
          createdAt: result.receipt.createdAt,
        },
        error: result.error,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(body, null, 2),
          },
        ],
        isError: !result.ok,
      };
    } catch {
      return { content: [{ type: "text", text: JSON.stringify({
        ok: false, data: null, error: "Receipt unavailable; request refused",
      }) }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[aletheia-boundary] MCP server ${PACKAGE_VERSION} running on stdio`,
  );
}

main().catch((err) => {
  console.error("[aletheia-boundary] fatal:", err);
  process.exit(1);
});
