# Release checklist — Aletheia Boundary

**Authority:** [SDLC.md](SDLC.md) §3–§5 and release matrix.  
**Current disposition:** [STATUS.md](STATUS.md) — **Production NO-GO** until every **blocking** production row is PASS on the **exact release commit SHA**.

Historical unit green or a prior SHA do **not** satisfy a new tag.

---

## 0. Pin the candidate

| Field | Value (2026-11-02 local run) |
|---|---|
| Context SHA / branch | main after PR #17 (`1634c33` merge lineage) |
| Package version | `0.0.11` |
| Platform | User Windows + Docker Postgres fixture |
| Policy | `policies/example.yaml` |

---

## 1. Verify gates (SDLC §3) — local 2026-11-02

| ID | Gate | Result | Notes |
|---|---|---|---|
| G1 | `npm ci` | **PASS** | |
| G2 | `npm run typecheck` | **PASS** | |
| G3 | `npm test` | **PASS** 62/62 | |
| G4 | `npm run test:integration` | **PASS** | Free-form SQL reason = `Invalid request` |
| G5 | `npm run test:attacks` | **PASS** | `leaks: 0` / 12 |
| Agent | `npm run test:agent-review` | **PASS** 11/0 | `docs/AGENT-REVIEW-2026-11-02.md` |
| Demo | `npm run demo` | **PASS** | Live; `chainOk: true` |
| G6 | Offline verify-log | **PASS** (C10) | Checkpoint custody still host-owned |

Local §1 is **cleared for this SHA**. Re-run on any later release candidate.

---

## 2. CI on the release commit (blocking)

| ID | Check | Result | Notes |
|---|---|---|---|
| CI-1 | Actions billing restored | **NOT RUN** | |
| CI-2 | Workflow on exact release SHA | **NOT RUN** | |
| CI-3 | G1–G5 green in Actions | **NOT RUN** | |

---

## 3. Review (SDLC §4) (blocking for 1.0)

| ID | Check | Result | Notes |
|---|---|---|---|
| R1 | Agent-review report for this SHA retained | **PASS** (local) | `AGENT-REVIEW-2026-11-02.md` |
| R2 | Adversarial disposition updated | **PASS** (local attacks) | Re-check after next kit run |
| R3 | **Independent** threat-model / security review | **NOT RUN** | Not self-cert |

---

## 4. Host operations (blocking for production)

| ID | Check | Result | Notes |
|---|---|---|---|
| H1 | Single writer per receipt log path | **NOT RUN** | |
| H2 | No raw-SQL / writable DB tool beside Boundary | **NOT RUN** | |
| H3 | Read-only production `DATABASE_URL` | **NOT RUN** | Local probe path exercised only |
| H4 | `BOUNDARY_CHECKPOINT_PATH` in production | **NOT RUN** | Dev may omit |
| H5 | Checkpoint custody outside writer domain | **NOT RUN** | |
| H6 | Key/ACL/backup/rotation drill | **NOT RUN** | |
| H7 | Storage recovery understanding | Partial | Injected FS only |

---

## 5. Release matrix (SDLC)

| Target | Minimum evidence | Decision |
|---|---|---|
| **0.0.x hardening candidate** | Local G1–G5 + agent PASS; blockers listed | Eligible as **pre-production** only |
| **Production / 1.0** | §1–§4 PASS on tagged SHA + R3 + H1–H5 | **Not authorized** |

---

## 6. Stop-ship (any one → NO-GO)

- Unauthorized data release or fail-open production path  
- Writable production DB URL or probe bypass in production  
- Unverifiable mandatory receipts / broken chain  
- CI claimed PASS when jobs did not run  
- Independent review skipped for a production tag  

---

## 7. Sign-off

| Role | Name | Date | Verdict |
|---|---|---|---|
| Implementer (local gates) | | 2026-11-02 | Local §1 PASS; production **NO-GO** |
| Independent reviewer | | | **NOT RUN** |
| Operator / host owner | | | **NOT RUN** |

---

*Checklist version: 2026-11-02. Local verify gates checked off; CI / independent review / host ops still open.*
