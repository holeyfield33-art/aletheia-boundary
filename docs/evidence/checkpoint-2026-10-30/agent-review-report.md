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
| C8 | Evidence (receipt signature verifies) | **PASS** | sigOk=true keyId=ed25519:0ab383e2c53475a0 hash=48e4b445a3a09abe… |
| C9 | Unknown tool refused | **PASS** | isError=true |
| C10 | Offline persisted receipt chain (G6) | **PASS** | OK: 9 receipt(s) verified. lastHash=48e4b445a3a09abe4f2cde27d2a45f74542d6ad7490461314c0005cd7c84954b checkpoint=not supplied |

Summary: **11 PASS**, **0 FAIL**, **0 SKIP**

No open checklist failures in this run.
