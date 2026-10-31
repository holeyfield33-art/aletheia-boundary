# Redteam gap map — Boundary × aletheia-redteam-kit

**Boundary repo:** [aletheia-boundary](https://github.com/holeyfield33-art/aletheia-boundary)  
**Redteam kit:** [aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit)

This document maps kit attack *categories* to what the boundary is responsible for. Use it to decide which findings are in-scope product bugs vs out-of-scope (must be handled by the agent host, policy author, or Aletheia Core).

## Responsibility split

| Layer | Owns |
|---|---|
| **Agent / orchestrator** | Which tools exist, prompt content, multi-turn state, tool-choice |
| **Aletheia Boundary** | Whether a `boundary_request` may touch data; minimization; receipts |
| **DB role / network** | Physical write prevention, network egress from the DB host |
| **Redteam kit** | Generating and scoring attacks against any of the above |

Boundary **does not** read model prompts. It only sees structured MCP tool arguments. Prompt injection that never becomes a tool call is **out of boundary scope** but still in kit scope.

---

## Category map

Legend:

- **Covered** — exercised by `audit/attacks.ts`, integration, or agent review  
- **Partial** — some enforcement; known residual risk  
- **Gap** — not enforced here; track as follow-up or host responsibility  
- **N/A** — wrong layer

| Kit category (examples) | Boundary status | Notes / next check |
|---|---|---|
| `data_exfiltration` / `exfil` | **Covered** (structured path) | Free-form SQL blocked (F1). Re-test with kit payloads that only use `resource` + `params.columns` |
| `tool_abuse` / `tool_use_escalation` | **Partial** | Boundary denies by policy; host must not expose a raw-SQL tool beside it |
| `path_traversal_tool_call` | **Partial** | Table ids validated (`isSafeIdentifier`); no filesystem provider yet |
| `function_calling_injection` | **N/A / Gap at host** | Injected tool args that still look structured may pass schema — policy must be strict |
| `encoding` / `obfuscated` / ETA encoded tool args | **Gap** | Boundary does not decode base64 in `resource` or column names; reject non-identifiers already, but dual-encoding of *purpose* is ignored |
| `prompt_injection` / `jailbreak` / `role_confusion` | **N/A** | Upstream of MCP; kit vs Core |
| `policy_evasion` / `policy_shadowing` | **Partial** | Zod fail-closed on load; runtime evasion = write a bad allow rule — customer policy risk |
| `output_truncation_exploit` | **Covered** (0.0.9) | `stats.truncated` honest via limit+1 |
| `environment_variable_leakage` / `key_leakage` | **Partial** | Keys on disk; never returned in tool payload. Ensure host does not mount key dir into agent sandbox |
| `sandbox_escape_attempt` / `test_harness_escape` | **N/A** | Process isolation is host/sandbox (aletheia-sandbox), not this binary |
| `supply_chain_sandbox_egress` | **Gap** | Boundary does not control agent network; pair with egress proxy (Aegis) |
| `resource_exhaustion` | **Partial** | Row cap + statement_timeout; no global rate limit / concurrency quota yet |
| `side_channel` | **Gap** | Timing/size oracles on deny vs allow not normalized |
| `session_campaigns` / multi-turn | **N/A** | Stateless per request; session policy is host |
| `rag_injection` / `context_poisoning` | **N/A** | No RAG surface in boundary |
| `auth_context_confusion` | **Partial** | `caller` is a match field only if policy uses it; not authenticated identity |
| `spec_violation` | **Covered** for MCP schema | Unknown tool / bad SQL refused; fuzz remaining JSON edge cases |
| Repo / supply-chain (kit `--mode repo`) | **Use kit** | Run against this tree for dependency and secret hygiene |

---

## Recommended kit runs against this repo

### 1. Offline repo audit (no API key)

```bash
cd aletheia-redteam-kit
source .venv/bin/activate
python -m kit.runner --mode repo \
  --repo-path /path/to/aletheia-boundary \
  --output runs/boundary_repo_summary.json
```

Look for secrets, risky patterns, lockfile issues.

### 2. Map exfil + tool-abuse catalogs to `boundary_request`

Manual or scripted: take payloads under `attacks/exfil/` and `attacks/` tool categories and **rewrite** them as MCP arguments only (no free-form SQL). Any payload that still extracts PII through `boundary_request` is a **boundary** finding — add it to `audit/attacks.ts`.

### 3. Hosted / Core audit (optional)

When an agent uses Boundary as its only data tool, run kit `--mode api` or `--mode agentic` against that agent stack. Boundary-relevant failures are those where the **tool result** contains denied data or missing `dataSource` / receipt evidence.

---

## Gaps prioritized for Boundary follow-ups

1. **Rate / concurrency limits** on `boundary_request` (resource_exhaustion).  
2. **Normalize deny timing** (side_channel).  
3. **File / S3 provider** with path allowlists (path_traversal) — only after CI green.  
4. **Optional decode-and-reject** of encoded identifiers in `resource` / columns.  
5. **Wire kit corpus** → permanent rows in `audit/attacks.ts` for every boundary-owned miss.

---

## In-repo evidence already held

| Suite | Command | Claim |
|---|---|---|
| Attack suite | `npm run test:attacks` | A1–A7 HELD, leaks 0 |
| Agent review | `npm run test:agent-review` | SDLC §5 C0–C9 |
| Integration | `npm run test:integration` | Probe, policy, SQL reject, canary |

Update this map when kit categories change or when a kit finding is promoted into `audit/attacks.ts`.
