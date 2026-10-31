# Agent review — 2026-10-30

Mode: **postgres (DATABASE_URL set)**

Graded from MCP tool results only (SDLC §5).

| ID | Check | Grade | Evidence |
|---|---|---|---|
| C0 | MCP exposes boundary_request | **PASS** | tools=boundary_request |
| C1 | Errors carry reasons | **PASS** | ok=false outcome=deny reason=PII / credential tables are denied by default |
| C2 | Real or fake is visible (dataSource) | **PASS** | dataSource=postgres expected=postgres live=true |
| C3 | Bounded output | **PASS** | ok=true rows=4 transforms=table:public.orders,limit:50,limit:50 |
| C4 | Declared scope (rule/reason + transforms) | **PASS** | ruleId=allow-schema reason=Schema inspection is permitted transforms=schema,schema-filtered:1 |
| C5 | Honest completion (limit/truncation visible) | **PASS** | rows=2 truncated=false transforms=table:public.orders,limit:2,limit:50 |
| C6 | Input handling (malformed/SQL clean refusal) | **PASS** | ok=false reason=Data plane error: Error: free-form SQL is not allowed. Use structured params: resource is the table; optional params.columns (string[]) and  |
| C7 | Repeatability | **PASS** | sameData=true outcomes=allow/allow |
| C8 | Evidence (receipt signature verifies) | **PASS** | sigOk=true keyId=ed25519:c28748818241d834 hash=faafa21a94ec39ca… |
| C9 | Unknown tool refused | **PASS** | isError=true |

Summary: **10 PASS**, **0 FAIL**, **0 SKIP**

No open checklist failures in this run.
