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
