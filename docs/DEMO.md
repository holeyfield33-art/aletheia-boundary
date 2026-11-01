# Local real testing + demo

**Production remains NO-GO.** This guide is for disposable local use and demos only.

Current disposition: [STATUS.md](STATUS.md).

---

## 1. One-shot demo (library path)

Shows allow / deny / encoding reject / free-form SQL reject / schema / offline receipt verify.

### With live Postgres (recommended)

```powershell
cd C:\Users\SuperAdmin\.vscode\aletheia-boundary
docker compose up -d
# wait until healthy
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
npx tsx scripts/demo.ts
```

### Without Docker (synthetic stub data)

```powershell
npx tsx scripts/demo.ts
```

Expect: six scenarios printed; final `chainOk: true`. Receipts written to `logs/demo-receipts.jsonl`.

---

## 2. Full local gate set (real testing)

```powershell
docker compose up -d
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
$env:DATABASE_URL_WRITABLE = "postgres://writable:writable@localhost:5434/boundary"

npm ci
npm run typecheck
npm test
npm run test:integration
npm run test:attacks
npm run test:agent-review
```

| Command | What it proves |
|---|---|
| `npm test` | Unit: policy fail-closed, receipts, concurrency, encoding, recovery |
| `test:integration` | Live read-only probe, structured queries, write refusal |
| `test:attacks` | Adversarial payloads against live boundary |
| `test:agent-review` | MCP client drives `boundary_request`; grades C0–C9 |

Record exit codes and keep stdout if you need evidence for a later release commit.

---

## 3. MCP server in use (product path)

```powershell
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
$env:BOUNDARY_POLICY = ".\policies\example.yaml"
$env:BOUNDARY_KEY_PATH = ".\keys\boundary.ed25519"
$env:BOUNDARY_LOG_PATH = ".\logs\receipts.jsonl"
# Dev only — no checkpoint required outside NODE_ENV=production
npm run dev
```

stdio MCP tool: `boundary_request`.

Example args:

```json
{
  "action": "query",
  "resource": "public.analytics_daily",
  "params": { "columns": ["date", "metric", "value"], "limit": 10 },
  "purpose": "demo"
}
```

Denied example:

```json
{
  "action": "query",
  "resource": "public.users",
  "params": { "columns": ["email"], "limit": 5 }
}
```

Offline verify after a session:

```powershell
npx tsx src/receipt/verify-cli.ts --log .\logs\receipts.jsonl --pub .\keys\boundary.pub.pem
```

(Public key path depends on how keys were written; demo uses `keys/demo.ed25519` and derives verify from the same keypair in-process.)

### Claude Desktop / Cursor sketch

```json
{
  "mcpServers": {
    "aletheia-boundary": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "C:/Users/SuperAdmin/.vscode/aletheia-boundary",
      "env": {
        "DATABASE_URL": "postgres://readonly:readonly@localhost:5434/boundary",
        "BOUNDARY_POLICY": "policies/example.yaml",
        "BOUNDARY_KEY_PATH": "keys/boundary.ed25519",
        "BOUNDARY_LOG_PATH": "logs/receipts.jsonl"
      }
    }
  }
}
```

Use a disposable DB and keys. Never point production credentials at a demo host.

---

## 4. What “good” looks like

| Scenario | Expected |
|---|---|
| `public.analytics_daily` query | `ok: true`, constrained columns, receipt |
| `public.users` query | `ok: false`, PII deny reason, receipt still signed |
| Base64 resource | `Invalid request` before policy |
| `params.sql` | `Invalid request` / unknown param |
| Receipt chain | Offline verify succeeds |
| Writable role as `DATABASE_URL` | Startup **refuses** (probe) |

---

## 5. Stop conditions

- Writable production DB URL  
- `NODE_ENV=production` without checkpoint  
- Claiming CI PASS when Actions did not run  
- Treating stub data as real customer data  

Production GO still requires CI on the release SHA, independent review, and host custody drills — see [STATUS.md](STATUS.md).
