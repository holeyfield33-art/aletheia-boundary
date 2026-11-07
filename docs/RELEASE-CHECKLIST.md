# Release checklist — Aletheia Boundary

**Authority:** [SDLC.md](SDLC.md) §3–§5 (invariants, gates, review) and §7 (release matrix).  
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

## 1. Verify gates (SDLC §4) — local 2026-11-02

| ID | Gate | Result | Notes |
|---|---|---|---|
| G1 | `npm ci` | **PASS** | |
| G2 | `npm run typecheck` | **PASS** | |
| G3 | `npm test` | **PASS** 62/62 | |
| G4 | `npm run test:integration` | **PASS** | Free-form SQL reason = `Invalid request` |
| G5 | `npm run test:attacks` | **PASS** | `leaks: 0` / 12 |
| Agent | `npm run test:agent-review` | **PASS** 11/0 | Generated `docs/AGENT-REVIEW-2026-11-02.md` was not committed; re-audit copy in [evidence/REAUDIT-2026-11-02](evidence/REAUDIT-2026-11-02/README.md) |
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

## 3. Review (SDLC §5) (blocking for 1.0)

| ID | Check | Result | Notes |
|---|---|---|---|
| R1 | Agent-review report for this SHA retained | **Partial** | Local run passed but the generated report was not committed; the re-audit's agent-review output is retained in [evidence/REAUDIT-2026-11-02](evidence/REAUDIT-2026-11-02/README.md) |
| R2 | Adversarial disposition updated | **OPEN** | 12/12 suite attacks hold, but the 2026-11-02 re-audit released denied rows (N1, N2); see [STATUS](STATUS.md) queue |
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

## 5. Beta (outside testers, disposable / non-sensitive data only)

Beta does not change the production NO-GO. Entry criteria are owned by
[STATUS](STATUS.md#beta-entry-criteria-target-friday); tick them here on the beta commit.

| ID | Check | Result | Notes |
|---|---|---|---|
| B1 | Queue Must items (N1, N2, N3, N9 version) closed, each with a failing-then-passing test | **PASS** | PRs #25, #27, #28, #29; see STATUS queue |
| B2 | §1 gates + agent review PASS locally on the beta commit, exit codes recorded | **Re-run needed** | Passed on code `3be09f9` (operator + cloud, `d7c8c0d`). N5 changes code again, so the gates must pass on the commit that is tagged |
| B3 | CI executed on the beta commit, or recorded NOT_RUN | **NOT_RUN** (recorded) | Actions billing lock: jobs get no runner. Allowed for beta |
| B4 | README states beta scope, known limitations and stop-ship | **PASS** | README "Status" section, 2026-11-07 |
| B5 | Tester instructions: disposable DB, read-only role, one writer per log | **Drafted** | [TEAM-SETUP](TEAM-SETUP.md); operator's Claude Desktop + Codex run open |

---

## 6. Release matrix (SDLC §7)

| Target | Minimum evidence | Decision |
|---|---|---|
| **Beta** | §5 B1–B5 | Operator; disposable data only |
| **Production / 1.0** | §1–§4 PASS on tagged SHA + R3 + H1–H5 | **Not authorized** |

---

## 7. Stop-ship (any one → NO-GO)

- Unauthorized data release or fail-open production path  
- Writable production DB URL or probe bypass in production  
- Unverifiable mandatory receipts / broken chain  
- CI claimed PASS when jobs did not run  
- Independent review skipped for a production tag  
- Stub data returned without `dataSource: "stub"`  

---

## 8. Sign-off

| Role | Name | Date | Verdict |
|---|---|---|---|
| Implementer (local gates) | | 2026-11-02 | Local §1 PASS; production **NO-GO** |
| Independent reviewer | | | **NOT RUN** |
| Operator / host owner | | | **NOT RUN** |

---

*Checklist version: 2026-11-02. Local verify gates checked off; CI / independent review / host ops still open.*
