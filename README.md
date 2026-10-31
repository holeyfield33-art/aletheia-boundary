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

**0.0.10 package; unreleased hardening candidate. Production: NO-GO.**
PRs #1�#3 are merged in base main `ab847a9`. This branch adds persistence-before-release,
schema column minimization, sanitized errors, and production/caller regressions.

Fresh results and remaining blockers: [hardening evidence](docs/HARDENING-2026-10-30.md).
Historical green reports do not authorize production. Mandatory release evidence includes
successful CI on the release commit, independent review, host isolation and storage recovery validation.
PR #4 CI jobs did not start because of a GitHub account billing lock; CI remains NOT RUN.

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

npm run test:attacks        # must print {"leaks":0,"total":12}
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

With `NODE_ENV=production`, missing `DATABASE_URL` or `BOUNDARY_SKIP_READONLY_PROBE=1` refuses startup. Outside production, without `DATABASE_URL` the server starts with **StubProvider** (synthetic dev data only). Responses set `dataSource: "stub"`. With `DATABASE_URL` set, a failed probe **exits 1** (never silent stub).

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

`purpose` is an agent claim, not authentication. Do not use it as the sole basis
for privileged access. Embedded library users must supply their own trusted caller context.
Schema metadata uses the intersection of schema constraints and all allowed sample/query
paths: column allowlists apply and redacted names/types are omitted. Denied tables are omitted.
Export-only tables remain hidden from schema discovery. This conservative contract may hide
columns a less restricted read path could otherwise return.

Response includes `ok`, `decision`, `data`, `transforms`, `stats` (incl. **`truncated`**), `dataSource` (`postgres` \| `stub`), and a receipt summary.

---

## Configuration (env)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Set `production` explicitly to enforce production startup guards |
| `BOUNDARY_TRUSTED_CALLER` | Host-controlled, process-wide identity; client `caller` is ignored. Use a separate process per identity |
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

## Receipt operations and recovery

MCP always uses a disk log. The library's no-path `ReceiptLog` is in-memory and has no durability guarantee.
For disk logs, a complete JSONL append and file sync must succeed before an allow response is returned.
On any write/sync/change failure the writer stays unavailable: MCP returns `ok:false`, `data:null`,
a generic error and **no receipt**. Library calls reject. No fallback deny receipt is invented.
Provider/policy exceptions use fixed public errors; raw exception text is excluded from signed decisions.
Operator-authored policy reasons and rule/constraint details remain visible; keep secrets out of policy text.

Use **one process/writer per log path**, on a trusted local filesystem with stable key custody.
Concurrent calls in that process serialize receipt writes. External writer changes are checked before append;
this is not a cross-process lock. Protect the log/key directory with host ACLs and restrict alternative DB tools.

Restart verifies every loaded receipt and refuses malformed, tampered or unterminated tails.
After failure: stop the process, preserve log and key, verify a copy offline, compare with an externally
stored last-hash checkpoint, and restore only independently verified evidence. Never automatically
trim a partial tail or delete the log to make startup pass. An appended receipt may survive a failed sync
or an interrupted response without proving data was received.

A local chain alone cannot detect deletion or rollback to a valid prefix across restarts.
External checkpoints/retention and a recovery drill are required before production.
File sync is not proof against faulty disks or power loss. New-file directory sync is attempted on POSIX;
Node does not provide it here on Windows. Multiwriter, Windows power-loss durability, disk-full hardware
behavior and key rotation remain unverified. See [remaining blockers](docs/HARDENING-2026-10-30.md).

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
