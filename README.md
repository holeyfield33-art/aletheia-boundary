# Aletheia Boundary

**Local, independent data-boundary enforcer for AI agents.**

Agents request approved data projections through this program. Approved
projections can enter a cloud model's tool context.

Aletheia Boundary runs on the customer's machine (or in their VPC) next to the
data. It decides what the agent may see, releases only the minimal cleaned
projection, and writes a tamper-evident log that the customer owns and the AI
vendor cannot edit.

> A visual rule alone cannot secure a system. Enforcement at the data boundary
> is the product; everything else is decoration.

**Related:** adversarial coverage and gap hunting →
[aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit)
· mapping → [docs/REDTEAM-GAP-MAP.md](docs/REDTEAM-GAP-MAP.md)

---

## Why this exists

OpenAI, Anthropic, or any other model provider cannot credibly be the thing that
controls and audits their own model's access to your data. The enforcement point
has to be local and independent of them.

### The three jobs

1. **Decide** — local policy: allow, deny, or allow-with-constraints.
2. **Keep the data in** — structured reads only; column/limit/redact; no
   free-form SQL.
3. **Log what happened** — hash-chained Ed25519 receipts the customer owns and
   can verify offline.

---

## Status

**0.0.11. Production: NO-GO. Beta (disposable data only): targeted for
2026-11-06 once the entry criteria in [docs/STATUS.md](docs/STATUS.md) are met.**

Local gates on `0f59c4c` (2026-11-02): G1–G5 and the agent review **PASS**
(62 unit; integration ok; attacks 12/12 held; agent review 11/11). CI is
**NOT_RUN** (Actions billing).

**Known limitations (open in the STATUS queue):**

- **N1:** policy matches the resource string exactly, while reads resolve a
  bare name to `public.<name>`. Until fixed, write deny rules that cover both
  spellings (`users` and `public.users`) or use globs such as `*users*`.
- **N2:** constraint values are not type-checked; `columns`/`redact` must be
  lists and `limit` a number, or the constraint is silently ignored. Check
  your policy against [policies/example.yaml](policies/example.yaml).
- Output is capped by rows, not bytes; equal-priority rules resolve by document
  order (write denies at a higher priority); rate-limit refusals write no receipt.

**Beta stop-ship:** a policy-denied row in a tool result, a write reaching the
database, a receipt that fails offline verification, or stub data without
`dataSource: "stub"`. Report any of these immediately.

**Still blocking production:** CI on the release commit, independent review,
host isolation and single-writer proof, checkpoint custody drills.
Cross-process quotas remain host-owned.

**Current status and plan:** [docs/STATUS.md](docs/STATUS.md) ·
**Release / beta checklist:** [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md) ·
**Local demo:** [docs/DEMO.md](docs/DEMO.md) · `npm run demo` ·
**Team setup (Claude Desktop, Codex):** [docs/TEAM-SETUP.md](docs/TEAM-SETUP.md) ·
**For coding agents:** [AGENTS.md](AGENTS.md) ·
Process: [docs/SDLC.md](docs/SDLC.md) · Gap map:
[docs/REDTEAM-GAP-MAP.md](docs/REDTEAM-GAP-MAP.md) ·
[CHANGELOG.md](CHANGELOG.md)

---

## Requirements

- **Node.js 20+** (22 recommended)
- **npm 10+**
- **Docker** (for integration / attack / agent-review against Postgres)
- Git

---

## Install

### Linux / macOS

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm ci          # preferred (uses committed package-lock.json)
# or: npm install
```

### Windows (PowerShell)

```powershell
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm ci
```

`npm ci` / `npm install` runs `prepare` → `tsc` and builds `dist/`.

---

## Run the gates

### Unit only (no database)

```bash
npm test
npm run typecheck
npm run test:recovery  # six process-termination/restart cases; no DB needed
npm run test:checkpoint # checkpoint, rollback and MCP startup cases; no DB needed
```

### Live Postgres (integration + attacks + agent review)

```bash
docker compose up -d
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary

npm run test:attacks        # must print {"leaks":0,"total":12}
npm run test:integration    # All integration checks passed
npm run test:agent-review   # MCP client checklist; writes docs/AGENT-REVIEW-<date>.md (git-ignored)
```

PowerShell:

```powershell
docker compose up -d
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
$env:DATABASE_URL_WRITABLE = "postgres://writable:writable@localhost:5434/boundary"

npm run test:attacks
npm run test:integration
npm run test:agent-review
```

Postgres listens on **host port 5434** → container 5432. Roles `readonly` /
`writable` are created by `scripts/init-readonly.sql`.

### Receipt verification

After a run that wrote a JSONL log:

```bash
npm run verify-log -- --log logs/receipts.jsonl --pub keys/boundary.pub.pem
```

---

## Run the MCP server (product path)

### Dev (TypeScript)

```bash
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export BOUNDARY_POLICY=./policies/example.yaml   # optional
export BOUNDARY_KEY_PATH=./keys/boundary.ed25519 # optional; created if missing
export BOUNDARY_LOG_PATH=./logs/receipts.jsonl   # optional

npm run dev
# equivalent: npx tsx src/mcp/server.ts
```

### Built binary

```bash
npm run build
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
npm start
# or: node dist/mcp/server.js
```

With `NODE_ENV=production`, missing `DATABASE_URL`, missing
`BOUNDARY_CHECKPOINT_PATH`, or `BOUNDARY_SKIP_READONLY_PROBE=1` refuses startup.
A configured checkpoint must validate against an existing log before MCP tools
are exposed. Outside production, without `DATABASE_URL` the server starts with
**StubProvider** (synthetic dev data only). Responses set `dataSource: "stub"`.
With `DATABASE_URL` set, a failed probe **exits 1** (never silent stub).

### Tool: `boundary_request`

```json
{
  "action": "query",
  "resource": "public.orders",
  "params": { "columns": ["id", "amount"], "limit": 20 },
  "purpose": "weekly report"
}
```

| Field                         | Rules                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| `action`                      | `query` \| `schema` \| `export` \| `sample`                        |
| `resource`                    | Table the policy matches **and** the table executed                |
| `params.sql` / `params.query` | **Rejected**                                                       |
| `params.columns`              | Optional string[]; intersected with policy                         |
| `params.limit`                | Optional; capped by policy and hard max **2000** (default **500**) |

`purpose` is an agent claim, not authentication. Do not use it as the sole basis
for privileged access. Embedded library users must supply their own trusted
caller context. Schema metadata uses the intersection of schema constraints and
all allowed sample/query paths: column allowlists apply and redacted names/types
are omitted. Denied tables are omitted. Export-only tables remain hidden from
schema discovery. This conservative contract may hide columns a less restricted
read path could otherwise return.

MCP applies process-local concurrency and rate limits before policy evaluation.
When a limit is hit the tool returns `ok: false` with a public error and **no
receipt**.

Response includes `ok`, `decision`, `data`, `transforms`, `stats` (incl.
**`truncated`**), `dataSource` (`postgres` \| `stub`), and a receipt summary
(when a receipt was written).

---

## Configuration (env)

| Variable                       | Purpose                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | Set `production` explicitly to enforce production startup guards                                                                |
| `BOUNDARY_TRUSTED_CALLER`      | Host-controlled, process-wide identity; client `caller` is ignored. Use a separate process per identity                         |
| `DATABASE_URL`                 | Postgres connection (read-only role recommended)                                                                                |
| `DATABASE_URL_WRITABLE`        | Integration only — prove probe refuses writers                                                                                  |
| `BOUNDARY_POLICY`              | Path to YAML policy (default `policies/example.yaml`)                                                                           |
| `BOUNDARY_KEY_PATH`            | Ed25519 private key PEM path                                                                                                    |
| `BOUNDARY_LOG_PATH`            | Receipt JSONL path                                                                                                              |
| `BOUNDARY_CHECKPOINT_PATH`     | Required in production: independently retained, trusted checkpoint JSON. Never automatically generated or updated by the server |
| `BOUNDARY_MAX_ROWS`            | Soft default row cap (clamped to hard max 2000)                                                                                 |
| `BOUNDARY_STMT_TIMEOUT_MS`     | Statement timeout (default 10000)                                                                                               |
| `BOUNDARY_MAX_CONCURRENT`      | Max in-flight `boundary_request` calls (default 4, hard max 32; 0 disables)                                                     |
| `BOUNDARY_RATE_LIMIT`          | Token-bucket rate in requests/sec (default 10, hard max 100; 0 disables)                                                        |
| `BOUNDARY_RATE_BURST`          | Token-bucket burst size (default = rate, hard max 200; 0 disables)                                                              |
| `BOUNDARY_SKIP_READONLY_PROBE` | `1` to skip probe (tests only; never production)                                                                                |
| `BOUNDARY_DB_IDENTITY`         | Label for receipts (never the connection string)                                                                                |

Process-local limits apply only inside a single Node process. Cross-process or
multi-instance quotas are host-owned.

---

## Receipt operations and recovery

See [docs/HOST-CUSTODY-RUNBOOK.md](docs/HOST-CUSTODY-RUNBOOK.md) for checkpoint custody and recovery, and [docs/STATUS.md](docs/STATUS.md) for what is proven. Migration notes for the checkpoint requirement: [archive/CHECKPOINT-2026-10-30.md](docs/archive/CHECKPOINT-2026-10-30.md). Production remains **NO-GO** until CI, independent review, and host ops clear.

## Adversarial coverage (redteam-kit)

In-repo gates (`audit/attacks.ts`, agent review) cover **data-plane** bypasses
an agent can send through `boundary_request`.

Broader agent/prompt/tool abuse classes live in:

**[https://github.com/holeyfield33-art/aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit)**

Map categories → boundary responsibility in:

**[docs/REDTEAM-GAP-MAP.md](docs/REDTEAM-GAP-MAP.md)**

---

## Design principles

1. Customer owns enforcement and the log.
2. Fail closed.
3. Minimize by default.
4. Receipts are first-class and offline-verifiable.
5. Local first.
6. One clear MCP tool surface.

---

## License

Apache-2.0 · [Aletheia Sovereign Systems](https://github.com/holeyfield33-art)
