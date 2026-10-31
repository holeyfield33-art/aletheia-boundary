# Agent review — 2026-10-30

**Historical report; superseded by [current hardening evidence](HARDENING-2026-10-30.md).** Conflict markers inherited from main were resolved for readability. The recorded C5 `truncated=false` does not satisfy the current honest-truncation gate; the historical PASS is not current proof.

Mode: **postgres (DATABASE_URL set)**

Graded from MCP tool results only (SDLC §5), via `audit/agent-review.ts`
(stdio MCP client → `boundary_request`).

| ID | Check | Grade | Evidence |
|---|---|---|---|
| C0 | MCP exposes boundary_request | **PASS** | tools=boundary_request |
| C1 | Errors carry reasons | **PASS** | ok=false outcome=deny reason=PII / credential tables are denied by default |
| C2 | Real or fake is visible (dataSource) | **PASS** | dataSource=postgres expected=postgres live=true |
| C3 | Bounded output | **PASS** | ok=true rows=4 transforms=table:public.orders,limit:50,limit:50 |
| C4 | Declared scope (rule/reason + transforms) | **PASS** | ruleId=allow-schema reason=Schema inspection is permitted transforms=schema,schema-filtered:1 |
| C5 | Honest completion (limit/truncation visible) | **PASS** | rows=2 truncated=false transforms=table:public.orders,limit:2,limit:50 |
| C6 | Input handling (malformed/SQL clean refusal) | **PASS** | ok=false reason includes free-form SQL is not allowed |
| C7 | Repeatability | **PASS** | sameData=true outcomes=allow/allow |
| C8 | Evidence (receipt signature verifies) | **PASS** | sigOk=true keyId present hash present |
| C9 | Unknown tool refused | **PASS** | isError=true |

Summary: **10 PASS**, **0 FAIL**, **0 SKIP**

No open checklist failures in this run.

## Observations (not failures)

- **C5 / `stats.truncated`:** When the boundary applies `LIMIT n` in SQL equal to the requested limit, the cursor does not fetch `n+1`, so `stats.truncated` may remain `false` even though more rows exist in the table. The limit is still declared in `transforms` (`limit:2`). A follow-up could fetch `limit+1` solely to set `truncated` honestly without releasing the extra row.
- **C4 / schema-filtered:** Live run showed `schema-filtered:1` (denied `users` omitted), confirming F10 on the MCP path.
