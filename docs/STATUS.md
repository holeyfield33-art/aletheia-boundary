# Aletheia Boundary — current status

**Date:** 2026-11-01  
**Package:** `0.0.11`  
**Production disposition:** **NO-GO** (unchanged)

This is the **single current plan/status document**. Dated ledgers under `docs/`
are historical evidence; they do not override this page.

---

## What Boundary is

Local, customer-owned MCP data-boundary enforcer:

1. **Decide** — policy allow / deny / allow-with-constraints (fail-closed).
2. **Minimize** — structured Postgres reads only; columns / limit / redact /
   sample; no free-form SQL.
3. **Prove** — hash-chained Ed25519 receipts the customer owns and can verify
   offline.

It is **not** an agent sandbox, prompt-injection filter, network firewall,
identity provider, or Studio product.

---

## E2E audit snapshot (2026-11-01)

| Gate                               | Result                               | Notes                                                                                      |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| G1 `npm ci`                        | PASS (user machine)                  | Lockfile resolves; zod ^4.6.7                                                              |
| G2 `npm run typecheck`             | Assumed with build                   | `prepare` runs `tsc`                                                                       |
| G3 `npm test`                      | **62 PASS / 0 FAIL**                 | Includes checkpoint, recovery, hardening, concurrency R1–R7, validate (encoding + purpose) |
| G4 integration                     | Historical PASS; re-run for release  | Needs Docker Postgres fixture                                                              |
| G5 attacks                         | Historical PASS; re-run for release  | `npm run test:attacks`                                                                     |
| Agent review                       | Historical 10/10; re-run for release | `npm run test:agent-review`                                                                |
| G6 offline verify-log              | Covered in unit/recovery             | Host checkpoint custody still open                                                         |
| CI on release commit               | **NOT RUN**                          | GitHub Actions billing lock                                                                |
| Independent review                 | **NOT RUN**                          | Mandatory for GO                                                                           |
| Host isolation / single-writer ops | **NOT RUN**                          | Code is process-local only                                                                 |
| Storage / key recovery drills      | Partial (injected FS)                | Physical power-loss / ENOSPC not certified                                                 |

Unit green does **not** equal production GO.

---

## Closed in code (Boundary-owned)

| ID                | Item                                                                            | Evidence                  |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------- |
| F1–F11            | Structured path, fail-closed policy, honest truncation, schema filter, receipts | SDLC / hardening          |
| R1–R7             | Process-local concurrency + rate limits                                         | `src/data/concurrency.ts` |
| H*/ K* / recovery | Receipt poison, restart contract, checkpoint floor                              | permanent suites          |
| NEXT-002          | Agent request shape + encoding reject before policy                             | `src/request/validate.ts` |
| NEXT-003          | Purpose `looksEncoded` residual + detector harden                               | same + tests              |

---

## Still open

### Code (optional / deferred)

| Item                                        | Status                    | Owner                                    |
| ------------------------------------------- | ------------------------- | ---------------------------------------- |
| Deny timing side-channel                    | Deferred (NEXT-001)       | Boundary — after CI or non-flaky harness |
| Cross-process rate / concurrency            | Out of scope              | **Host**                                 |
| Filesystem provider path traversal          | N/A until provider exists | Boundary later                           |
| Kit re-run against structured-only payloads | Recommended               | Redteam kit + Boundary                   |

### Ops / release (blocking GO)

| Item                                         | Status                               |
| -------------------------------------------- | ------------------------------------ |
| CI green on exact release SHA                | NOT RUN (billing)                    |
| Independent review                           | NOT RUN                              |
| Host isolation + single-writer proof         | NOT RUN                              |
| Checkpoint custody / publication / freshness | Host-owned; code only provides floor |
| Physical storage / key rotation drills       | NOT RUN                              |

---

## Plan order (what the docs say to do next)

From SDLC + NEXT-001 + gap map, in priority:

1. **Ops unlock:** restore Actions billing → CI on main → record exact SHA.
2. **Independent review** of threat model + receipt/custody story.
3. **Host drills:** single-writer log path, no raw-SQL tool beside Boundary,
   checkpoint custody outside writer domain.
4. **Optional code:** side-channel timing normalization _only_ with non-flaky
   tests; or kit-driven structured exfil cases into `audit/attacks.ts`.
5. **Do not** claim GO from unit green alone.

---

## Relationship to Software Research Studio

Studio repo: <https://github.com/holeyfield33-art/software-research-studio>

| Studio claim               | Status           | Boundary implication                                                         |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| 003/003R archive integrity | GO (scoped)      | Cite freeze pins only; do not mutate                                         |
| 003R novel-input selector  | **NO-GO**        | Do not import selector into Boundary                                         |
| UNIVERSAL-ARCH-001         | Design candidate | Advisory mapping only → [STUDIO-FREEZE-MAPPING.md](STUDIO-FREEZE-MAPPING.md) |
| Studio product integration | **NO-GO**        | Boundary is independent; no product link                                     |
| Studio kernel / pilots     | Partial / HOLD   | Separate evidence domain                                                     |

**Immutable freeze pin** (do not replace with “latest main”):

| Field                       | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Freeze ID                   | `SRS-FREEZE-2026-10-31-v1`                                         |
| Checkpoint                  | `STUDIO-KNOWLEDGE-003R`                                            |
| Freeze commit               | `89fe5485e37f315eab6b5131e715bcd2115bbe31`                         |
| `FROZEN_STATE.json` SHA-256 | `c46aa1beeb10185def012bef6cfd362bde7effc6e867febac0cf4154a0e61e18` |

Studio’s own next milestones (2026-11-01): pause engine expansion; consolidate
agent-facing context; preserve demonstrated lessons — **not** more gate-count or
Stage 004.

Boundary may be assessed **by** Studio as an external project; Studio must not
become Boundary’s runtime authority.

---

## Repository-maintenance procedure (documentation only)

[SDLC §10](SDLC.md) now specifies change-triggered tests, dependency/advisory handling, pre/post-deployment security checks and a **proposed monthly** operational health review appropriate for a high-exposure security boundary. The operator must approve the cadence. **No maintenance review, live-host test, release-commit CI, independent approval or checkpoint-custody drill was executed by this documentation change.** Production remains **NO-GO** and the open operations blockers above are unchanged.

---

## Doc map (after cleanup)

| Read first                                                   | Purpose                    |
| ------------------------------------------------------------ | -------------------------- |
| [STATUS.md](STATUS.md) (this file)                           | Current plan + disposition |
| [../README.md](../README.md)                                 | Install, run, contract     |
| [SDLC.md](SDLC.md)                                           | Gates and process          |
| [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md)                     | Kit category ownership     |
| [STUDIO-FREEZE-MAPPING.md](STUDIO-FREEZE-MAPPING.md)         | Advisory Studio alignment  |
| [agent-playbook/START-HERE.md](agent-playbook/START-HERE.md) | Agent entry                |

| Historical evidence (do not treat as current GO)                         |
| ------------------------------------------------------------------------ |
| CHECKPOINT / HARDENING / RECOVERY / AUDIT / AGENT-REVIEW dated 2026-10-* |
| BOUNDARY-NEXT-001 … 003 (increment ledgers)                              |
| `docs/evidence/**` raw gate outputs                                      |

---

_Update this file when disposition, package version, or blocking open items
change. Production remains NO-GO until ops blockers clear._

## Local product verification — 2026-11-01 (America/Los_Angeles)

Tested source HEAD: `e53629400042bb8309c230dbba1cfaac7063dafb`; local disposable Postgres 16 fixture. Production remains **NO-GO**. These fresh local results qualify the historical snapshot above; they are not release CI or independent review.

- `npm ci`: exit 0; `npm run typecheck`: exit 0; `npm test`: exit 0, 62 passed / 0 failed.
- `npm run test:integration`: exit 1 at `src/integration.test.ts:167`. Read-only role accepted and writable role refused before failure. SQL request was denied, but the assertion requires "free-form SQL" / "not allowed" while the public response is "Invalid request". Later integration checks did not execute.
- `npm run test:attacks`: exit 0; zero leaks across 12 cases; write canary remained empty.
- `node --import tsx audit/agent-review.ts`: exit 1; 10 passed / 1 failed / 0 skipped. C6 has the same rejection-wording mismatch. C0 tool discovery and C10 offline verification of nine persisted receipts passed. Used the underlying script without `--write-report` to preserve the pre-existing untracked report.
- Separate stdio MCP client discovered `boundary_request`, successfully queried analytics with the requested projection, denied users, rejected encoded resource and `params.sql`, and retrieved filtered schema. All responses identified `dataSource: postgres`; offline verification passed for all five receipts (exit 0). Disposable keys/logs were separate from the configured host log.
- Native Aletheia tools were not available in the running Codex chat; restart/client loading remains a separate unverified step. MCP startup reports 0.0.10 while package metadata is 0.0.11.

Raw outputs: `C:/Users/SuperAdmin/Documents/Codex/2026-11-01/i-x20/outputs/aletheia-local-verification/`.
Next: reconcile the rejection-message contract and rerun integration/agent review; restart Codex and confirm native tool loading. No application code changed. Existing production blockers remain open.

## Host / custody rehearsal — 2026-11-01 (America/Los_Angeles)

Tested HEAD `1634c33d74468befbbc9ce39816e68c5639cb97e`; production **NO-GO** unchanged. See [evidence and exact exits](evidence/HOST-CUSTODY-2026-11-01/REPORT.md) and [operator runbook](HOST-CUSTODY-RUNBOOK.md).

Fresh build and disposable container rehearsal completed (exit 0): verified candidate export/no overwrite; production-mode matching-anchor startup; missing/corrupt/wrong-key/rolled-back anchor refusals; writer denied checkpoint modification/deletion; UID/file permissions; trusted caller binding; isolated-agent negative DB/key access; writable-role refusal; retained old/advanced-anchor freshness demonstration; empty write canary. Native Codex boundary_request is now loaded and returned real Postgres analytics data.

**Host isolation is not complete:** current desktop agent retains shell/Docker/direct fixture access. Another container name can open the same log; only stale-writer refusal and same-name supervisor exclusion were demonstrated. Actual exclusive supervision/agent restrictions remain required. Read-only checkpoint custody is proven only against the writer container, not the shared Docker administrator. Human approval, freshness-policy acceptance, independent custody/publication, physical recovery drills, release CI and independent review remain open. Rehearsal anchors are not approved production anchors. Added only drill tooling/docs; no application code, configured host keys/log history or production settings were changed (native MCP connectivity check appended a normal receipt).

Operator decision — 2026-11-01: checkpoint freshness cadence approved: anchor after each completed batch; pause the next batch until checkpoint approval and publication. This is a runbook policy decision, not approval of a particular checkpoint or evidence that a runtime batch interlock exists. Independent custody, actual human checkpoint publication, exclusive supervision and all remaining production blockers remain open. Production remains NO-GO.

## Checklist assessment prepared for review

[Annotated host/independent-review checklist](HOST-ISOLATION-CHECKLIST.md) records demonstrated disposable drill/artifact rows separately from open production-host controls. Tested application SHA is `1634c33d74468befbbc9ce39816e68c5639cb97e`, package 0.0.11. PR intent is docs/host-custody-evidence into main, not a release. The referenced RELEASE-CHECKLIST.md does not exist at this SHA; no independent-review sign-off or complete same-release-SHA gate pack is claimed.

PR preparation on application SHA 1634c33: integration rerun exit 0; MCP agent review rerun exit 0 (11 pass / 0 fail / 0 skip). [Raw outputs](evidence/HOST-CUSTODY-2026-11-01/current-head-gates/) supersede the earlier wording failures for these commands on this SHA. Other local gates and CI were not rerun in this preparation; no production-host or independent-review promotion is implied.
