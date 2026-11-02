# Aletheia Boundary — current status

**Date:** 2026-11-02  
**Package:** `0.0.11`  
**Production disposition:** **NO-GO** (unchanged — local gates are not production GO)

This is the **single current plan/status document**. Dated ledgers under `docs/` are historical evidence; they do not override this page.

**Operator tick-list:** [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)

---

## What Boundary is

Local, customer-owned MCP data-boundary enforcer:

1. **Decide** — policy allow / deny / allow-with-constraints (fail-closed).
2. **Minimize** — structured Postgres reads only; columns / limit / redact / sample; no free-form SQL.
3. **Prove** — hash-chained Ed25519 receipts the customer owns and can verify offline.

It is **not** an agent sandbox, prompt-injection filter, network firewall, identity provider, or Studio product.

---

## E2E audit snapshot (2026-11-02, local live)

Pinned context: main after merge of PR #17 (`1634c33` lineage). Live Postgres via `docker compose`; `DATABASE_URL` + `DATABASE_URL_WRITABLE` set.

| Gate | Result | Notes |
|---|---|---|
| G1 `npm ci` | **PASS** | User machine; lockfile resolves |
| G2 `npm run typecheck` | **PASS** | `tsc --noEmit` |
| G3 `npm test` | **PASS** 62/62 | Checkpoint, recovery, hardening, concurrency R1–R7, validate |
| G4 integration | **PASS** | All `[ok]` incl. free-form SQL → `Invalid request` |
| G5 attacks | **PASS** | `leaks: 0` / 12 |
| Agent review | **PASS** 11/0 | Report: `docs/AGENT-REVIEW-2026-11-02.md`; C6 accepts shape-layer reason |
| Demo (`npm run demo`) | **PASS** | Live allow/deny/encoding/SQL reject; `chainOk: true` |
| MCP product path (`npm run dev` probes) | **PASS** | Schema/query/deny/SQL reject/receipts |
| G6 offline verify-log | **PASS** in agent-review C10 | Host checkpoint custody still open |
| CI on release commit | **NOT RUN** | Actions billing |
| Independent review | **NOT RUN** | Mandatory for production GO |
| Host isolation / single-writer ops | **NOT RUN** | Code is process-local only |
| Storage / key recovery drills | Partial (injected FS) | Physical power-loss / ENOSPC not certified |

**Local gates G1–G5 + agent review are green.** That does **not** authorize production.

Harness note: after NEXT-002, free-form `sql` is rejected before policy with public reason **`Invalid request`**. Integration and agent-review C6 matchers were updated (PR #17) so live gates score correctly.

---

## Closed in code (Boundary-owned)

| ID | Item | Evidence |
|---|---|---|
| F1–F11 | Structured path, fail-closed policy, honest truncation, schema filter, receipts | SDLC / hardening |
| R1–R7 | Process-local concurrency + rate limits | `src/data/concurrency.ts` |
| H* / K* / recovery | Receipt poison, restart contract, checkpoint floor | permanent suites |
| NEXT-002 | Agent request shape + encoding reject before policy | `src/request/validate.ts` |
| NEXT-003 | Purpose `looksEncoded` residual + detector harden | same + tests |
| Test harness | Integration + C6 accept `Invalid request` for SQL shape reject | PR #17 |

---

## Still open

### Code (optional / deferred)

| Item | Status | Owner |
|---|---|---|
| Deny timing side-channel | Deferred (NEXT-001) | Boundary — after CI or non-flaky harness |
| Cross-process rate / concurrency | Out of scope | **Host** |
| Filesystem provider path traversal | N/A until provider exists | Boundary later |
| Kit re-run against structured-only payloads | Recommended | Redteam kit + Boundary |

### Ops / release (blocking GO)

| Item | Status |
|---|---|
| CI green on exact release SHA | **NOT RUN** (billing) |
| Independent review | **NOT RUN** |
| Host isolation + single-writer proof | **NOT RUN** |
| Checkpoint custody / publication / freshness | Host-owned; code only provides floor |
| Physical storage / key rotation drills | **NOT RUN** |

---

## Plan order (next)

1. **Ops unlock:** restore Actions billing → CI on **exact** release SHA → record run.  
2. **Independent review** of threat model + receipt/custody story.  
3. **Host drills:** single-writer log path, no raw-SQL tool beside Boundary, checkpoint custody outside writer domain.  
4. **Optional code:** side-channel timing only with non-flaky tests; or kit-driven structured exfil into `audit/attacks.ts`.  
5. **Do not** claim GO from local unit/integration/agent-review alone.

Tick progress in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

---

## Relationship to Software Research Studio

Studio repo: https://github.com/holeyfield33-art/software-research-studio  

| Studio claim | Status | Boundary implication |
|---|---|---|
| 003/003R archive integrity | GO (scoped) | Cite freeze pins only; do not mutate |
| 003R novel-input selector | **NO-GO** | Do not import selector into Boundary |
| UNIVERSAL-ARCH-001 | Design candidate | Advisory mapping only → [STUDIO-FREEZE-MAPPING.md](STUDIO-FREEZE-MAPPING.md) |
| Studio product integration | **NO-GO** | Boundary is independent; no product link |

**Immutable freeze pin:** `SRS-FREEZE-2026-10-31-v1` / commit `89fe5485e37f315eab6b5131e715bcd2115bbe31`.

Boundary may be assessed **by** Studio as an external project; Studio must not become Boundary’s runtime authority.

---

## Doc map

| Read first | Purpose |
|---|---|
| [STATUS.md](STATUS.md) (this file) | Current plan + disposition |
| [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) | SDLC-aligned release gates |
| [DEMO.md](DEMO.md) | Local real testing + demo |
| [../README.md](../README.md) | Install, run, contract |
| [SDLC.md](SDLC.md) | Gates and process |
| [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md) | Kit category ownership |
| [AGENT-REVIEW-2026-11-02.md](AGENT-REVIEW-2026-11-02.md) | Latest agent-review report (11 PASS) |

---

*Update this file when disposition, package version, or blocking open items change. Production remains NO-GO until ops blockers clear.*
