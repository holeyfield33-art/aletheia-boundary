#!/usr/bin/env node
/**
 * Aletheia Boundary MCP server.
 *
 * Exposes a single tool: boundary_request.
 * The agent never talks to the data source directly.
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
import { loadOrCreateKeyPair } from "../receipt/crypto.js";
import { StubProvider } from "../data/provider.js";
import type { DataProvider } from "../data/provider.js";

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
      `[aletheia-boundary] Failed to load policy from ${path}: ${err}`,
    );
    return new PolicyEngine({
      version: "0",
      defaultEffect: "deny",
      rules: [],
    });
  }
}

async function createProvider(): Promise<DataProvider> {
  if (process.env.DATABASE_URL) {
    try {
      const { createPostgresProviderFromEnv } = await import(
        "../data/postgres.js"
      );
      const provider = await createPostgresProviderFromEnv();
      console.error("[aletheia-boundary] Postgres provider ready (read-only probe passed)");
      return provider;
    } catch (err) {
      console.error(
        `[aletheia-boundary] Postgres provider failed, falling back to StubProvider: ${err}`,
      );
      return new StubProvider();
    }
  }
  console.error("[aletheia-boundary] No DATABASE_URL — using StubProvider");
  return new StubProvider();
}

async function main() {
  const policy = loadPolicy();
  const provider = await createProvider();

  const keyPath =
    process.env.BOUNDARY_KEY_PATH ?? resolve(process.cwd(), "keys/boundary.ed25519");
  const keyPair = loadOrCreateKeyPair(keyPath);
  console.error(`[aletheia-boundary] Signing key: ${keyPair.keyId}`);

  const logPath =
    process.env.BOUNDARY_LOG_PATH ?? resolve(process.cwd(), "logs/receipts.jsonl");
  const log = new ReceiptLog(keyPair, logPath);
  console.error(`[aletheia-boundary] Receipt log: ${logPath} (${log.getAll().length} existing)`);

  const boundary = new Boundary(policy, provider, log);

  const server = new Server(
    {
      name: "aletheia-boundary",
      version: "0.0.2",
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
          "All access is policy-checked, minimized, and receipted. " +
          "Raw data never leaves the customer boundary.",
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
              description: "Table, collection, or file identifier",
            },
            params: {
              type: "object",
              description:
                "Optional parameters. For query/export: { sql, values? }. For sample: optional limit via policy constraints.",
            },
            purpose: {
              type: "string",
              description: "Claimed purpose / context for the request",
            },
            caller: {
              type: "string",
              description: "Optional caller / session identity",
            },
          },
          required: ["action", "resource"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "boundary_request") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
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

    const result = await boundary.handle({
      action: args.action,
      resource: args.resource,
      params: args.params,
      purpose: args.purpose,
      caller: args.caller,
    });

    const body = {
      ok: result.ok,
      decision: result.decision,
      data: result.payload?.data ?? null,
      transforms: result.payload?.transforms ?? [],
      stats: result.payload?.stats,
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
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[aletheia-boundary] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[aletheia-boundary] fatal:", err);
  process.exit(1);
});
