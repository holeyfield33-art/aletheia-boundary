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
   Evaluate every request against local policy. Allow, deny, or allow-with-constraints.

2. **Keep the data in**  
   Raw data stays local. Only what policy permits leaves the boundary — after column projection, row limits, redaction, or sampling. Free-form SQL is not accepted; the boundary builds the statement from the policy resource and structured params.

3. **Log what actually happened**  
   Every decision and every release is recorded in a hash-chained, Ed25519-signed, customer-owned log. The vendor cannot rewrite history. Offline verification ships in-repo.

---

## Architecture

```
Cloud / local agent
        |
        |  MCP tool: boundary_request
        v
+-------------------------------------+
|        Aletheia Boundary            |
|  (runs next to the data)            |
|                                     |
|  1. Policy engine (zod-validated)   |
|  2. Data plane (structured only)    |
|  3. Receipt log (hash chain + sig)  |
+-------------------------------------+
        |
        |  cleaned payload + receipt + dataSource
        v
      Agent receives only what was allowed
```

Fail-closed by default. Policy miss, invalid policy, probe failure, log corruption, or provider error → deny or refuse to start.

---

## Status

**0.0.7** — audit findings **F1–F8 closed**. Attack suite: **7/7 HELD**. Unit + integration gates green.

| Invariant | Status | Evidence |
|---|---|---|
| I1 Policy binds to what executes | **Enforced** | Structured queries only; `params.sql` rejected. A1–A3 HELD |
| I2 No over-release beyond projection | **Enforced** | Column/limit applied on boundary-built SELECT. A1–A2 HELD |
| I3 Fail closed | **Enforced** | Zod policy load; no stub when `DATABASE_URL` set; unknown effects/constraints rejected. A4–A5 HELD |
| I4 Receipts are evidence | **Enforced** | Recursive canonical hash; forge invalidates. A6 HELD; `npm run verify-log` |
| I5 No writes | **Enforced** | Read-only probe + READ ONLY txn. A7 HELD; write canary empty |
| I6 Agent contract | **Partial** | `dataSource`, deny reasons, transforms present. F9–F11 (bounds/schema metadata) still open |

Still open (SDLC steps 5–6):

- **F9** tighter default output bounds  
- **F10** schema responses should not advertise denied tables/columns  
- **F11** residual version/metadata polish (mostly done for MCP version)  
- **CI** for G1–G6 when GitHub Actions billing is available  

> **Not a 1.0 product yet.** Do not put untrusted production PII behind this until F9–F10 and a full agent/adversarial review on the structured surface are done. The critical read-side and receipt failures from the 2026-10-29 audit are closed; remaining items are medium severity.

Process: [docs/SDLC.md](docs/SDLC.md)  
Original audit (historical): [docs/AUDIT-2026-10-29.md](docs/AUDIT-2026-10-29.md)  
Changelog: [CHANGELOG.md](CHANGELOG.md)

---

## Quick start

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm ci   # or: npm install

# Unit tests (node:test — failures exit non-zero)
npm test

# Live Postgres + attack suite + integration
docker compose up -d
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary
npm run test:attacks      # must print leaks:0
npm run test:integration  # all assertions pass

# Offline receipt verification (after a run that wrote logs/receipts.jsonl)
npm run verify-log -- --log logs/receipts.jsonl --pub keys/boundary.pub.pem
```

Windows PowerShell:

```powershell
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
$env:DATABASE_URL_WRITABLE = "postgres://writable:writable@localhost:5434/boundary"
npm run test:attacks
npm run test:integration
```

### Structured requests (no free-form SQL)

```json
{
  "action": "query",
  "resource": "public.orders",
  "params": { "columns": ["id", "amount"], "limit": 20 }
}
```

- `resource` is the table the policy matches **and** the table the boundary reads.
- `params.sql` / `params.query` are rejected.
- Optional `params.columns` (string[]) and `params.limit` (number); policy constraints still apply.

MCP tool: `boundary_request` (stdio). Responses include `ok`, `decision`, `data`, `transforms`, `dataSource` (`postgres` | `stub`), and a receipt summary.

---

## Design principles

1. **Customer owns the enforcement and the log.** Vendor cannot be judge of its own access.
2. **Fail closed.** Ambiguity or failure = deny or refuse to start.
3. **Minimize by default.** Release the smallest projection that satisfies the request under policy.
4. **Receipts are first-class.** Every decision is cryptographically attributable and offline-verifiable.
5. **Local first.** Works offline / air-gapped. Cloud is optional.
6. **One clear tool surface.** Prefer a small, well-specified MCP tool over a large API surface.

---

## License

Apache-2.0

---

Built by [Aletheia Sovereign Systems](https://github.com/holeyfield33-art) — the independent layer the platforms cannot be.
