# Aletheia Boundary

**Local, independent data-boundary enforcer for AI agents.**

The cloud model never touches your data. It asks this program.

Aletheia Boundary runs on the customer's machine (or in their VPC) next to the data. It decides what the agent may see, releases only the minimal cleaned projection, and writes a tamper-evident log that the customer owns and the AI vendor cannot edit.

> A visual rule alone cannot secure a system. Enforcement at the data boundary is the product; everything else is decoration.

---

## Why this exists

OpenAI, Anthropic, or any other model provider cannot credibly be the thing that controls and audits their own model's access to your data. The enforcement point has to be local and independent of them.

This is the independent layer that sits between any agent (cloud or local) and the data it wants to touch.

### The three jobs

1. **Decide**  
   Evaluate every request (read this table, export that file, run this query) against local policy. Allow, deny, or allow-with-constraints.

2. **Keep the data in**  
   Raw data stays local. Only what policy permits leaves the boundary — after column filtering, row filtering, identifier stripping, aggregation, sampling, or redaction.

3. **Log what actually happened**  
   Every decision and every release is recorded in a hash-chained, signed, customer-owned log. The vendor cannot rewrite history.

---

## Architecture

```
Cloud / local agent
        |
        |  MCP / HTTP / stdio tool call
        v
+-------------------------------------+
|        Aletheia Boundary            |
|  (runs next to the data)            |
|                                     |
|  1. Policy engine                   |
|     - local rules                   |
|     - purpose / context claims      |
|     - allow / deny / constrain      |
|                                     |
|  2. Data plane                      |
|     - minimizer / projector         |
|     - providers (Postgres first)    |
|                                     |
|  3. Receipt + log writer            |
|     - hash chain                    |
|     - Ed25519 signature             |
|     - customer-owned key            |
+-------------------------------------+
        |
        |  cleaned payload + receipt
        v
      Agent receives only what was allowed
```

Fail-closed by default. Policy miss, log failure, or provider error → deny.

---

## Relationship to existing work

| Component              | Role in this product                                      |
|------------------------|-----------------------------------------------------------|
| `aletheia-sandbox`     | Hardened read-only Postgres path (probe, classifier, cursor) |
| Aegis provenance       | Signed spans, egress checks, trust lattice patterns       |
| Aletheia Core          | Runtime policy / intent validation patterns               |

Boundary is the **data-plane enforcement point**. The sandbox hardening is reused as the Postgres provider. Aegis-style receipts are the log format.

This repository is intentionally separate so the boundary can be deployed, versioned, and audited independently of any single agent or model vendor.

---

## Status

**0.0.3** — core path + live Postgres integration test.

### Done

- [x] Repository + architecture documentation
- [x] Core TypeScript interfaces (`Policy`, `Decision`, `Request`, `Receipt`)
- [x] Minimal MCP server exposing `boundary_request`
- [x] Declarative YAML/JSON policy (allow/deny + simple transforms)
- [x] Postgres provider (read-only probe, classifier, bounded cursor, minimizer)
- [x] Hash-chained, Ed25519-signed, persistent receipt log
- [x] Fail-closed path + smoke test (signature verification included)
- [x] Live integration test against real read-only Postgres (docker-compose)

### Still open

- [ ] File / S3 provider
- [ ] Richer policy language (CEL or similar)
- [ ] Hardware key / OS keychain backend for Ed25519
- [ ] CI workflow that spins docker + runs integration

---

## Layout

```
src/
  types.ts
  boundary.ts              Orchestrator
  boundary.test.ts         Unit smoke test (no DB)
  integration.test.ts      Live Postgres integration test
  policy/engine.ts
  receipt/
    crypto.ts              Ed25519 keygen / sign / verify
    log.ts                 Hash-chained + persistent JSONL log
  data/
    provider.ts            DataProvider + StubProvider
    postgres.ts            Hardened Postgres provider + minimizer
  mcp/server.ts
  index.ts
policies/example.yaml
scripts/init-readonly.sql
docker-compose.yml
```

---

## Quick start

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm install

# Smoke test (no DB required)
npm test

# Integration test (spins local Postgres)
docker compose up -d
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary
npm run test:integration

# Run MCP against the local DB
export BOUNDARY_POLICY="./policies/example.yaml"
export BOUNDARY_KEY_PATH="./keys/boundary.ed25519"
export BOUNDARY_LOG_PATH="./logs/receipts.jsonl"
npm run dev
```

On first run the server creates `keys/boundary.ed25519` (mode 0600) and the matching `.pub.pem`. Receipts are appended to `logs/receipts.jsonl`.

Agent config example:

```json
{
  "mcpServers": {
    "aletheia-boundary": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgres://readonly:readonly@localhost:5434/boundary",
        "BOUNDARY_POLICY": "./policies/example.yaml",
        "BOUNDARY_KEY_PATH": "./keys/boundary.ed25519",
        "BOUNDARY_LOG_PATH": "./logs/receipts.jsonl"
      }
    }
  }
}
```

The agent receives a single constrained tool. It never talks directly to the database.

---

## What the integration test covers

1. Read-only probe **accepts** the `readonly` role
2. Read-only probe **refuses** the `writable` role
3. Schema inspection allowed + receipt verifies
4. `public.users` denied by policy (PII rule)
5. `sample public.orders` allowed with limit constraint
6. Analytics query allowed with column projection (no extra columns leak)
7. `pg_read_file` blocked by classifier
8. Multi-statement injection blocked
9. `write_canary` table still empty (no unauthorized writes)
10. Full receipt hash chain + Ed25519 signatures valid end-to-end

---

## Postgres hardening (what is enforced)

1. **Startup write probe** — catalog inspection; refuses to start if the role can INSERT/UPDATE/DELETE/TRUNCATE or CREATE.
2. **READ ONLY transaction** — every statement runs inside `BEGIN ... READ ONLY` and is always rolled back.
3. **Classifier** — single-pass tokenizer blocks multi-statement and dangerous functions (`pg_read_file`, `dblink`, etc.).
4. **Bounded cursor fetch** — rows are never fully materialized beyond the configured cap.
5. **Minimizer** — policy constraints (`columns`, `redact`, `limit`, `sample`) are applied before data leaves the boundary.

---

## Design principles

1. **Customer owns the enforcement and the log.** Vendor cannot be judge of its own access.
2. **Fail closed.** Ambiguity or failure = deny.
3. **Minimize by default.** Release the smallest projection that satisfies the request under policy.
4. **Receipts are first-class.** Every decision is cryptographically attributable.
5. **Local first.** Works offline / air-gapped. Cloud is optional.
6. **One clear tool surface.** Prefer a small, well-specified MCP tool over a large API surface.

---

## License

Apache-2.0

---

Built by [Aletheia Sovereign Systems](https://github.com/holeyfield33-art) — the independent layer the platforms cannot be.
