# BOUNDARY-NEXT-001 — Release evidence hardening

**Date:** 2026-11-01  
**Base main:** `9e2dd18f9fb129c173c8d4f51109b1c8fd3ce372`  
**Production disposition:** **NO-GO** (unchanged)

This note verifies release blockers against the current implementation and gap map, records prioritization decisions, and pins external Studio citations. It does **not** authorize production, CI success, or readiness status change.

---

## 1. Release blockers vs implementation

Sources: [CHECKPOINT-2026-10-30.md](CHECKPOINT-2026-10-30.md), [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md), [README.md](../README.md), merged PRs #9–#11.

| Blocker (release / ops) | Implementation status | Evidence | Still open? |
|---|---|---|---|
| CI on release commit | NOT RUN (billing) | Checkpoint gate ledger; README | **Yes** |
| Independent review | NOT RUN | Checkpoint gate ledger | **Yes** |
| Host isolation / single-writer ops proof | Code: process-local serialize + external change check; **not** cross-process lock | H4; README receipt section | **Yes** (host) |
| External checkpoint custody, publication, freshness window | Code: minimum-history floor only | K1–K10; K9 residual | **Yes** (host) |
| Storage recovery (power loss, physical ENOSPC, dir durability) | Injected FS faults + six-phase kill; not physical | H1–H3; recovery suite | **Yes** |
| Key/ACL/rotation/backup drills | Not run | Checkpoint remaining blockers | **Yes** |
| Host raw-DB bypass prevention | Read-only probe + role checks; host must not expose writers | Integration / production guards | **Yes** (host) |
| Resource exhaustion (in-process) | Process-local max concurrent + token-bucket rate + row/stmt limits | R1–R7; `src/data/concurrency.ts` | **Partial closed** in-process |
| Resource exhaustion (cross-process / multi-instance) | Not implemented | Explicit host-owned | **Yes** (host) |
| Side-channel (deny vs allow timing/size) | Not normalized | Gap map `side_channel` | **Yes** (see §2) |
| External redteam kit campaign | Not run this cycle | Gap map | **Yes** |

**Mandatory release evidence (still required before any GO):** successful CI on the release commit, independent review, host isolation validation, storage/checkpoint custody recovery validation. Historical unit green (including 52-pass runs with R1–R7) does **not** satisfy that list.

---

## 2. Deny-response timing (side_channel) — prioritization

**Decision: defer implementation in this increment.**

Justification against current threat model and evidence:

1. **Attack surface priority:** Boundary’s highest-impact failures are data release and receipt integrity. Those paths already have permanent suites (F/H/K/recovery/attacks). Timing oracles on deny vs allow are real but secondary when the agent already receives explicit `ok: false` and policy outcomes.
2. **Measurement cost:** Honest normalization needs a defined baseline (constant-time policy path vs padded delay) and tests that do not flake under load. Without CI and a stable timing harness, shipping a half-fix risks false confidence.
3. **Host context:** Many deployments place Boundary behind host rate limits and process isolation; residual timing leakage is partly mitigated by process-local rate limits (default 10/s) reducing probe bandwidth.
4. **Gap map order:** After process-local resource limits landed, side_channel is the top *code* follow-up, but release blockers above are **ops/evidence** blockers. Advancing side_channel code does not clear CI, review, or custody.

**When to pick up:** after CI is runnable or as a focused spike with non-flaky timing tests; keep threat model explicit (local attacker with tool access measuring response times).

---

## 3. Process-local vs host-enforced resource limits

| Control | Where enforced | Defaults / clamps | Receipt on reject? |
|---|---|---|---|
| Max rows | Provider + policy constraints | Default 500, hard max 2000 (`BOUNDARY_MAX_ROWS`) | N/A (truncation with `stats.truncated`) |
| Statement timeout | Postgres session | Default 10000 ms (`BOUNDARY_STMT_TIMEOUT_MS`) | Fail → sanitized deny path |
| Max concurrent in-flight `boundary_request` | MCP process (`RequestLimiter`) | Default 4, hard max 32; 0 disables (`BOUNDARY_MAX_CONCURRENT`) | **No** receipt; public error |
| Request rate (token bucket) | MCP process | Default 10/s, hard max 100; burst default = rate, hard max 200 | **No** receipt; public error |
| Cross-process / multi-instance quotas | **Host** (not Boundary) | — | Host-defined |
| Single writer per log path | **Host** process model + in-process serialize | One process per log | — |
| Network egress / raw DB tools | **Host** | — | — |

Operator rule: process-local limits are a backstop inside one Node process. They do not replace host-level concurrency, load balancing isolation, or firewall rules.

---

## 4. Studio citation pin

Citations to Software Research Studio in Boundary docs must use **immutable** identifiers, not “latest main.”

| Field | Value |
|---|---|
| Freeze repository | https://github.com/holeyfield33-art/software-research-studio-freeze-2026-10-31 |
| Freeze ID | `SRS-FREEZE-2026-10-31-v1` |
| Authoritative checkpoint | `STUDIO-KNOWLEDGE-003R` |
| Freeze repo commit (clone verified) | `89fe5485e37f315eab6b5131e715bcd2115bbe31` |
| `FROZEN_STATE.json` SHA-256 | `c46aa1beeb10185def012bef6cfd362bde7effc6e867febac0cf4154a0e61e18` |
| Studio selector reliability | **NO-GO** |
| Studio product integration | **NO-GO** |
| Boundary mapping doc | [STUDIO-FREEZE-MAPPING.md](STUDIO-FREEZE-MAPPING.md) (advisory) |

Do not mutate the freeze. Selector fixes require a new Studio checkpoint (e.g. 003R2), not edits to this pin.

---

## 5. Regression / adversarial verification gate

Before any change to readiness language (including soft wording toward GO):

```powershell
npm ci
npm run typecheck
npm test                    # includes R1-R7, H*, K*, recovery
# With disposable Postgres when claiming live gates:
docker compose up -d
$env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
$env:DATABASE_URL_WRITABLE = "postgres://writable:writable@localhost:5434/boundary"
npm run test:integration
npm run test:attacks
npm run test:agent-review
```

**This increment:** documentation and prioritization only. No readiness status change. Recent main verification (post-PR #9) reported **52 PASS / 0 FAIL** including concurrency R1–R7; that remains unit evidence only.

---

## 6. Outcomes of BOUNDARY-NEXT-001

| Action | Result |
|---|---|
| Verify blockers | Ledger in §1; production NO-GO affirmed |
| Side-channel timing | Deferred with written justification (§2) |
| Process-local vs host limits | Documented in §3; gap map must match implementation |
| Studio pins | §4 hashes/IDs; mapping doc remains advisory |
| Regression before readiness change | Required gate in §5; not executed as a status change |

**Next Boundary-owned code priority (when choosing implementation work):** normalize deny timing *or* encoding reject — only with tests; do not treat as release unlock.

**Next release unlock (ops):** CI billing/repair → green release commit; independent review; checkpoint custody + single-writer host drill.

---

*BOUNDARY-NEXT-001 complete as an evidence/documentation action. Independent of Studio roadmap.*
