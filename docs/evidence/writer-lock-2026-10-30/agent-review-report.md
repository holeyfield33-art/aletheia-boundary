# Agent review — 2026-10-31

Mode: **postgres (DATABASE_URL set)**

Graded from MCP tool results only (SDLC §5).

| ID | Check | Grade | Evidence |
|---|---|---|---|
| C0 | MCP exposes boundary_request | **PASS** | tools=boundary_request |
| C1 | Errors carry reasons | **PASS** | ok=false outcome=deny reason=PII / credential tables are denied by default |
| C2 | Real or fake is visible (dataSource) | **PASS** | dataSource=postgres expected=postgres live=true |
| C3 | Bounded output | **PASS** | ok=true rows=4 transforms=table:public.orders,limit:50,limit:50 |
| C4 | Declared scope (rule/reason + transforms) | **PASS** | ruleId=allow-schema reason=Schema inspection is permitted transforms=schema,schema-columns-projected,schema-filtered |
| C5 | Honest completion (limit/truncation visible) | **PASS** | rows=2 truncated=true transforms=table:public.orders,limit:2,limit:50 |
| C6 | Input handling (malformed/SQL clean refusal) | **PASS** | ok=false reason=Data request failed; input not allowed or provider unavailable Data request failed; input not allowed or provider unavailable |
| C7 | Repeatability | **PASS** | sameData=true outcomes=allow/allow |
| C8 | Evidence (receipt signature verifies) | **PASS** | sigOk=true keyId=ed25519:a9320a6314361ccf hash=e7d51edc0554f0ea… |
| C9 | Unknown tool refused | **PASS** | isError=true |
| C10 | Offline persisted receipt chain (G6) | **PASS** | OK: 9 receipt(s) verified. lastHash=e7d51edc0554f0eac54d43a0b463c6bdec2772c71b659f9a444a8f398afebb82 checkpoint=not supplied |

Summary: **11 PASS**, **0 FAIL**, **0 SKIP**

No open checklist failures in this run.
