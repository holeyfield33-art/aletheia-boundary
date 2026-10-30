# Aletheia Boundary

**Local, independent data-boundary enforcer for AI agents.**

The cloud model never touches your data. It asks this program.

Aletheia Boundary runs on the customer's machine (or in their VPC) next to the data. It decides what the agent may see, releases only the minimal cleaned projection, and writes a tamper-evident log that the customer owns and the AI vendor cannot edit.

> A visual rule alone cannot secure a system. Enforcement at the data boundary is the product; everything else is decoration.

---

## Why this exists

OpenAI, Anthropic, or any other model provider cannot credibly be the thing that controls and audits their own model's access to your data. The enforcement point has to be local and independent of them.

### The three jobs

1. **Decide** — local policy: allow, deny, or allow-with-constraints.  
2. **Keep the data in** — structured reads only; column/limit/redact; no free-form SQL.  
3. **Log what happened** — hash-chained Ed25519 receipts the customer owns and can verify offline.

---

## Status

**0.0.9** — F1–F11 closed; I1–I6 enforced; formal MCP agent review **10/10 PASS**; honest `stats.truncated`.

| Invariant | Status | Evidence |
|---|---|---|
| I1 Policy binds to what executes | **Enforced** | Structured queries; A1–A3 HELD |
| I2 No over-release | **Enforced** | Column/limit on boundary-built SELECT |
| I3 Fail closed | **Enforced** | Zod policy; no stub when `DATABASE_URL` set |
| I4 Receipts are evidence | **Enforced** | Canonical hash; A6 HELD; `npm run verify-log` |
| I5 No writes | **Enforced** | Read-only probe + READ ONLY txn; A7 HELD |
| I6 Agent contract | **Enforced** | `dataSource`, reasons, transforms, row caps, schema filter, **`stats.truncated`** |

| Gate / review | Status |
|---|---|
| Unit / attacks / integration | Green locally |
| Agent review (SDLC §5) | [docs/AGENT-REVIEW-2026-10-30.md](docs/AGENT-REVIEW-2026-10-30.md) |
| CI (G1–G5) | Workflow checked in; **enable after GitHub Actions billing** (planned Monday) |

> **Not 1.0 yet.** Critical audit findings are closed and local gates pass. Call it 1.0 only after CI is green on `main` and you are comfortable with production threat model.

Process: [docs/SDLC.md](docs/SDLC.md) · Audit: [docs/AUDIT-2026-10-29.md](docs/AUDIT-2026-10-29.md) · [CHANGELOG.md](CHANGELOG.md)

---

## Quick start

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm ci

npm test

docker compose up -d
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary
npm run test:attacks
npm run test:integration
npm run test:agent-review
```

PowerShell:

```powershell
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
$env:DATABASE_URL_WRITABLE = "postgres://writable:writable@localhost:5434/boundary"
npm run test:attacks
npm run test:integration
npm run test:agent-review
```

### Structured requests

```json
{
  "action": "query",
  "resource": "public.orders",
  "params": { "columns": ["id", "amount"], "limit": 20 }
}
```

- `resource` is the table policy matches **and** the table executed.
- `params.sql` is rejected.
- Default max rows **500**, hard max **2000** (`BOUNDARY_MAX_ROWS`).
- If more rows exist than the applied limit, **`stats.truncated` is `true`** (extra row is fetched then dropped, never released).

MCP tool: `boundary_request`. Responses include `ok`, `decision`, `data`, `transforms`, `stats`, `dataSource`, and a receipt summary.

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
