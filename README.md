# Aletheia Boundary

**Local, independent data-boundary enforcer for AI agents.**

The cloud model never touches your data. It asks this program.

Aletheia Boundary runs on the customer's machine (or in their VPC) next to the data. It decides what the agent may see, releases only the minimal cleaned projection, and writes a tamper-evident log that the customer owns and the AI vendor cannot edit.

> A visual rule alone cannot secure a system. Enforcement at the data boundary is the product; everything else is decoration.

**Related:** adversarial coverage and gap hunting → [aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit) · mapping → [docs/REDTEAM-GAP-MAP.md](docs/REDTEAM-GAP-MAP.md)

---

## Why this exists

OpenAI, Anthropic, or any other model provider cannot credibly be the thing that controls and audits their own model's access to your data. The enforcement point has to be local and independent of them.

### The three jobs

1. **Decide** — local policy: allow, deny, or allow-with-constraints.  
2. **Keep the data in** — structured reads only; column/limit/redact; no free-form SQL.  
3. **Log what happened** — hash-chained Ed25519 receipts the customer owns and can verify offline.

---

## Status

**0.0.9** — F1–F11 closed; I1–I6 enforced; MCP agent review **10/10**; honest `stats.truncated`.

| Invariant | Status | Evidence |
|---|---|---|
| I1 Policy binds to what executes | **Enforced** | Structured queries; A1–A3 HELD |
| I2 No over-release | **Enforced** | Column/limit on boundary-built SELECT |
| I3 Fail closed | **Enforced** | Zod policy; no stub when `DATABASE_URL` set |
| I4 Receipts are evidence | **Enforced** | Canonical hash; A6 HELD; `npm run verify-log` |
| I5 No writes | **Enforced** | Read-only probe + READ ONLY txn; A7 HELD |
| I6 Agent contract | **Enforced** | `dataSource`, reasons, transforms, row caps, schema filter, `stats.truncated` |

| Gate | Status |
|---|---|
| Unit / attacks / integration | Green locally |
| Agent review | [docs/AGENT-REVIEW-2026-10-30.md](docs/AGENT-REVIEW-2026-10-30.md) |
| CI G1–G5 | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — enable after Actions billing |

> **Not 1.0 yet.** Call it 1.0 only after CI is green on `main` and the production threat model is accepted.

Process: [docs/SDLC.md](docs/SDLC.md) · Audit: [docs/AUDIT-2026-10-29.md](docs/AUDIT-2026-10-29.md) · [CHANGELOG.md](CHANGELOG.md)

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
```

### Live Postgres (integration + attacks + agent review)

```bash
docker compose up -d
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary

npm run test:attacks        # must print {"leaks":0,"total":7}
npm run test:integration    # All integration checks passed
npm run test:agent-review   # MCP client checklist; writes docs/AGENT-REVIEW-*.md
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

Postgres listens on **host port 5434** → container 5432. Roles `readonly` / `writable` are created by `scripts/init-readonly.sql`.

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

Without `DATABASE_URL` the server starts with **StubProvider** (dev only). Responses set `dataSource: "stub"`. With `DATABASE_URL` set, a failed probe **exits 1** (never silent stub).

### Tool: `boundary_request`

```json
{
  "action": "query",
  "resource": "public.orders",
  "params": { "columns": ["id", "amount"], "limit": 20 },
  "purpose": "weekly report"
}
```

| Field | Rules |
|---|---|
| `action` | `query` \| `schema` \| `export` \| `sample` |
| `resource` | Table the policy matches **and** the table executed |
| `params.sql` / `params.query` | **Rejected** |
| `params.columns` | Optional string[]; intersected with policy |
| `params.limit` | Optional; capped by policy and hard max **2000** (default **500**) |

Response includes `ok`, `decision`, `data`, `transforms`, `stats` (incl. **`truncated`**), `dataSource` (`postgres` \| `stub`), and a receipt summary.

---

## Configuration (env)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (read-only role recommended) |
| `DATABASE_URL_WRITABLE` | Integration only — prove probe refuses writers |
| `BOUNDARY_POLICY` | Path to YAML policy (default `policies/example.yaml`) |
| `BOUNDARY_KEY_PATH` | Ed25519 private key PEM path |
| `BOUNDARY_LOG_PATH` | Receipt JSONL path |
| `BOUNDARY_MAX_ROWS` | Soft default row cap (clamped to hard max 2000) |
| `BOUNDARY_STMT_TIMEOUT_MS` | Statement timeout (default 10000) |
| `BOUNDARY_SKIP_READONLY_PROBE` | `1` to skip probe (tests only; never production) |
| `BOUNDARY_DB_IDENTITY` | Label for receipts (never the connection string) |

---

## Adversarial coverage (redteam-kit)

In-repo gates (`audit/attacks.ts`, agent review) cover **data-plane** bypasses an agent can send through `boundary_request`.

Broader agent/prompt/tool abuse classes live in:

**[https://github.com/holeyfield33-art/aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit)**

Use that kit to find **gaps this boundary does not claim to cover** (prompt injection upstream of the tool, multi-turn coercion, encoding, etc.). Map categories → boundary responsibility in:

**[docs/REDTEAM-GAP-MAP.md](docs/REDTEAM-GAP-MAP.md)**

Install kit (Python 3.11+):

```bash
git clone https://github.com/holeyfield33-art/aletheia-redteam-kit.git
cd aletheia-redteam-kit
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -e ".[verify]"
python -m kit.runner --help
```

Repo audit of this boundary tree (offline, no API key):

```bash
python -m kit.runner --mode repo --repo-path /path/to/aletheia-boundary --output boundary_repo_summary.json
```

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
