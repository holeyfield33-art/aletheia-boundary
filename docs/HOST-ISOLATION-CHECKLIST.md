# Host isolation & independent review checklists

## Assessment — November 1, 2026 (America/Los_Angeles)

Application SHA: `1634c33d74468befbbc9ce39816e68c5639cb97e`, package `0.0.11`.
PR branch intent: `docs/host-custody-evidence` into `main`; no release/tag.
Evidence: [dated report](evidence/HOST-CUSTODY-2026-11-01/REPORT.md),
[raw outcomes](evidence/HOST-CUSTODY-2026-11-01/run-2/RESULTS.json),
[redacted tool configuration](evidence/HOST-CUSTODY-2026-11-01/tool-config-redacted.json),
and [runbook](HOST-CUSTODY-RUNBOOK.md).

Legend: ☑ = demonstrated drill or prepared artifact at the stated scope;
☐ = not closed for an actual isolated production host. Checkmarks never transfer
from the disposable fixture to a different deployment or release SHA.

**Verified drill/artifact rows:** A3.4; A4.1, A4.2, A4.5–A4.8;
A5.1–A5.4; B1.1 and B1.4. A4.2 proves matching-anchor startup, not that a
trusted production checkpoint has been approved. A3.4 is the written intended
allowlist; it is not yet an enforced restriction on this desktop.

**Scoped evidence, still unchecked for production:** A1.3 (Linux volume key
permissions), A2.1–A2.2 (disposable DB role and writable-role refusal), A3.3
(host-controlled caller), A4.3–A4.4 (writer cannot alter two retained checkpoint
copies). Same Docker administrator can still replace the volumes; independent
custody, durable retention and human approval are unproven. A2.3 specifically
requires the skip variable to be unset: the fixture set it to `0`, so do not
mark that literal configuration check complete.

**Open:** A1.1–A1.2 exclusive writer ownership; A1.4 kill/restart evidence for
this candidate (graceful restarts were tested, not forced termination);
A2.4 and A3.1–A3.2 alternate DB access; B1.2 missing release checklist;
B1.3 a complete same-SHA G1–G5 pack; B1.5 reviewer selection; all B2–B4.
A differently named writer can open the same log. The current desktop agent has
shell and Docker authority. A network-none container negative probe is not an
end-to-end isolated agent deployment.

The freshness policy is operator-approved: anchor each completed batch and keep
the next batch paused until checkpoint approval/publication. No runtime batch
interlock is implemented. All reviewer scope/sign-off boxes (B2–B4) remain unchecked; this
assessment is not an independent review. Production remains **NO-GO**.

---

Use these with a **pinned SHA** and `docs/RELEASE-CHECKLIST.md` (not present at the tested SHA). Local G1–G5 green does **not** mark these done.

---

## A. Host isolation checklist

**Goal:** The agent’s only path to this data is Boundary; one writer owns the receipt log; production config is fail-closed.

### A1. Process & log

| # | Check | Done |
|---|---|---|
| A1.1 | Exactly **one** Boundary process (or one deliberate writer) per receipt log path | ☐ |
| A1.2 | Log path documented (`BOUNDARY_LOG_PATH`); not shared with another instance | ☐ |
| A1.3 | Key path documented (`BOUNDARY_KEY_PATH`); private key not world-readable | ☐ |
| A1.4 | Restart after kill still loads/verifies the same log (or fails closed on damage) | ☐ |

### A2. Database path

| # | Check | Done |
|---|---|---|
| A2.1 | Production `DATABASE_URL` uses a **read-only** role | ☐ |
| A2.2 | Writable URL as `DATABASE_URL` is **refused** by probe (already true in integration; confirm on the real host role) | ☐ |
| A2.3 | `BOUNDARY_SKIP_READONLY_PROBE` is **unset** in production | ☐ |
| A2.4 | No second connection string for the same agent to the same DB | ☐ |

### A3. Agent / tool surface

| # | Check | Done |
|---|---|---|
| A3.1 | MCP (or host) config exposes **only** `boundary_request` for this data | ☐ |
| A3.2 | No raw SQL tool, `psql`, admin GUI, or other MCP DB server on the same credentials for that agent | ☐ |
| A3.3 | `BOUNDARY_TRUSTED_CALLER` (if used) set by **host env**, not by the model | ☐ |
| A3.4 | Written allowlist: “tools/processes that may touch this DB” | ☑ |

### A4. Checkpoint custody (host)

| # | Check | Done |
|---|---|---|
| A4.1 | `NODE_ENV=production` **without** `BOUNDARY_CHECKPOINT_PATH` → process **refuses** to serve | ☑ |
| A4.2 | Valid checkpoint path required; file is non-empty and verifies against the log | ☑ |
| A4.3 | Checkpoint stored **outside** the writer’s easy delete/replace domain (other dir, other volume, offline copy, or separate ACL) | ☐ |
| A4.4 | Prior checkpoints retained (do not only keep “latest”) | ☐ |
| A4.5 | Export candidate only after offline verify; never overwrite an existing checkpoint file blindly | ☑ |
| A4.6 | Drill: shorten log to older valid prefix with advanced checkpoint → startup **refuses** | ☑ |
| A4.7 | Drill: corrupt / wrong-key checkpoint → startup **refuses** | ☑ |
| A4.8 | Freshness rule written (how often checkpoint advances; max acceptable unanchored suffix) | ☑ |

### A5. Evidence pack (attach for review)

| # | Artifact | Done |
|---|---|---|
| A5.1 | Host diagram or short note: process, DB role, log, key, checkpoint locations | ☑ |
| A5.2 | MCP/tool config excerpt (secrets redacted) | ☑ |
| A5.3 | Command outputs for A4.1, A4.6, A4.7 | ☑ |
| A5.4 | Pinned `git rev-parse HEAD` + package version | ☑ |

Checked drill rows below record disposable rehearsal results only, not a production-host sign-off. **Host isolation PASS** only when A1–A4 are checked and A5 is filed. This is **operator** work; you can run it yourself on a disposable host first.

---

## B. Independent review checklist

**Goal:** A second party (not the implementer of that SHA) records whether production use is acceptable.

### B1. Preconditions (you prepare)

| # | Check | Done |
|---|---|---|
| B1.1 | Pin exact commit SHA + branch/tag intent | ☑ |
| B1.2 | STATUS + RELEASE-CHECKLIST current for that SHA | ☐ |
| B1.3 | Local or CI gate outputs retained (G1–G5, agent-review report) | ☐ |
| B1.4 | Host isolation evidence pack (A5) attached or linked | ☑ |
| B1.5 | Reviewer is **not** the primary implementer of the candidate | ☐ |

### B2. Scope the reviewer must cover

| # | Topic | Reviewer marks |
|---|---|---|
| B2.1 | Threat model: in-scope vs out-of-scope (prompt injection upstream, host bypass, etc.) | ☐ |
| B2.2 | Policy binds to executed structured path; no free-form SQL | ☐ |
| B2.3 | Client-controlled fields (`purpose`, spoofed caller) cannot escalate alone | ☐ |
| B2.4 | Fail-closed production config (DB, probe, checkpoint) | ☐ |
| B2.5 | Receipt chain + checkpoint story vs host assumptions | ☐ |
| B2.6 | Residual risks listed honestly; owners (Boundary vs host) clear | ☐ |

### B3. Reviewer deliverable

| # | Output | Done |
|---|---|---|
| B3.1 | Written report: SHA, date, reviewer name/role | ☐ |
| B3.2 | Verdict: **approve** / **approve with conditions** / **reject** | ☐ |
| B3.3 | Conditions (if any) are specific and testable | ☐ |
| B3.4 | Explicit statement that self-cert of the implementer was **not** used as independent review | ☐ |

### B4. After review

| # | Action | Done |
|---|---|---|
| B4.1 | File report under `docs/` or evidence path; link from STATUS | ☐ |
| B4.2 | Update RELEASE-CHECKLIST §3 (R3) and sign-off table | ☐ |
| B4.3 | If reject/conditions: fix or document accepted risk **before** any production GO claim | ☐ |

**Independent review PASS** only when B3 is complete with approve (or approve-with-conditions fully closed).

---

## C. How this maps to production GO

| Blocker | Checklist | Who |
|---|---|---|
| Local verify gates | RELEASE-CHECKLIST §1 | Mixed-SHA local evidence; not a complete release-SHA gate pack |
| CI on exact SHA | §2 | You + Actions billing |
| Independent review | **B** above → §3 R3 | External/peer reviewer |
| Host isolation + custody | **A** above → §4 | You (operator), then reviewer reads A5 |

All four must be PASS on the **same** release SHA before STATUS may say production GO.

---

## D. Minimal “run this week” subset (solo)

If you only do a short pass before formal review:

1. **A3.1–A3.2** — strip alternate DB tools for the agent
2. **A2.1–A2.3** — readonly URL, no probe skip
3. **A4.1, A4.6, A4.7** — three checkpoint drills, save stdout
4. **A5** — one-page note + outputs
5. **B1 + hand pack to a second person** for B2–B3

That is enough to *start* independent review; it is not production GO by itself.