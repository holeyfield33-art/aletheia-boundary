# Aletheia Boundary — current status

**Updated:** 2026-11-07 · **Code at:** `main` `d90797e` · **Package:** `0.0.11`
**Production:** **NO-GO** · **Beta target:** 2026-11-06 missed. All Must items (N1, N2, N3, N9 version) closed; N10 (dates) fixed on branch; remaining beta steps: operator Claude Desktop + Codex run (B5) and the beta tag (E3). New date set by the operator

This is the **only** living status and plan. Everything dated under
[`archive/`](archive/README.md) is history; [`evidence/`](evidence/) holds immutable raw
results. When this page and an older document disagree, this page wins. Update
it in place; never append dated session logs.

---

## What Boundary is

A local, customer-owned MCP data-boundary enforcer between AI agents and
Postgres. It **decides** (policy allow / deny / allow-with-constraints, fail
closed), **minimizes** (structured reads only; columns, limit, redact, sample;
no free-form SQL) and **proves** (hash-chained Ed25519 receipts the customer
verifies offline). It is not an agent sandbox, identity provider, network
firewall or prompt-injection filter. Contract: [README](../README.md) ·
rules and gates: [SDLC](SDLC.md).

---

## Working rule

**One item → failing test → fix → local gates → merge → update this page → repeat.**
Code work is limited to security fixes and bugs. Every security fix lands with
a permanent attack in `audit/attacks.ts` that fails before the fix. Merges
follow a local G1–G6 run while GitHub Actions is billing-locked (CI recorded as
NOT_RUN, never PASS).

---

## Phases

| Phase | Scope | State |
|---|---|---|
| 0 · Foundation (0.0.1–0.0.3) | Core decide/minimize/receipt path, Postgres provider, MCP tool | **Done** |
| 1 · Audit remediation (0.0.4–0.0.9) | 2026-10-29 audit F1–F11: structured reads only, fail-closed policy, recursive receipt hashing, verify-on-load, honest truncation, schema filtering | **Done**, with residuals reopened as N1, N2, N9 below |
| 2 · Hardening (0.0.10–0.0.11) | Receipt durability (H1–H10), trusted checkpoints (K1–K10), crash recovery drill, process-local rate/concurrency limits (R1–R7), request shape/encoding validation (NEXT-002/003), sanitized errors, host-trusted caller | **Done in code** |
| 3 · Hardening + local isolation | Security bugs from the 2026-11-02 re-audit; local host-isolation rehearsal | **Current** — queue below |
| 4 · Beta + design-partner validation | Outside testers and 2–3 paid design partners on synthetic or approved non-production data; prove (or disprove) that buyers pay for what Boundary adds over native Postgres controls | **Next** — entry criteria and Phase 4 work below; commercial track in [VALIDATION-PLAN](VALIDATION-PLAN.md) |
| 5 · Production 1.0 | Independent review, production host custody, physical recovery drills, CI on the tagged SHA | **Not started** (blocked on items outside the code) |

---

## Current queue (Phase 3) — work top to bottom, one item at a time

Findings N1–N9 come from the [2026-11-02 re-audit](evidence/REAUDIT-2026-11-02/REPORT.md).

| # | Item | Type · severity | Needed for beta | State |
|---|---|---|---|---|
| 1 | **N1** Policy matches the exact resource string; the provider reads `public.<name>`. A deny on `public.users` misses `users` (and the reverse). Resolve to canonical `schema.table` before policy and schema filtering; match case consistently. | Security · High | **Must** | **Closed** 2026-11-07 in PR #25 (`5ab88d7`): engine and provider share one canonical `schema.table` key; deny rules match any case, allow rules exact case. Attacks N1a/N1b LEAK before, HELD after |
| 2 | **N2** Constraint `value` is untyped (`z.unknown()`): `columns: "id"`, `redact: "ssn"`, `limit: "1"` load and are silently not enforced. Type every constraint value in the schema. | Security · High | **Must** | **Closed** 2026-11-07 in PR #27 (`811308f`): constraint values typed at load (`columns`/`redact` non-empty identifier lists, `limit`/`sample` positive integers). Attacks N2 LEAK before, HELD after |
| 3 | **N3** Attack A7 cannot detect a read-write escape (its SQL is refused before Postgres). Replace with a test that reaches Postgres or asserts the probe + `READ ONLY` transaction directly. | Test gap · Medium | **Must** | **Closed** 2026-11-07 in PR #28 (`9689281`): A7a (startup probe), A7b (`READ ONLY`, 25006) and A7c (role privileges after a read-write escape, 42501) reach Postgres; each LEAKs with its layer removed |
| 4 | **N9** MCP server reports `0.0.10` while the package is `0.0.11`; read the version from `package.json`. Rate-limit refusals write no receipt. | Bug · Low | **Must** (version) | Version: **Closed** 2026-11-07 in PR #29 (`d90797e`): read from `package.json`; H11 fails before, passes after. Rate-limit receipts: **Open**, not required for beta |
| 5 | **N10** (found 2026-11-07 in an MCP stdio run on the volume seed) `date` and `timestamp without time zone` values were returned as JS timestamps at the server's local midnight: on a UTC+9 host the stored `2026-10-01` reached the agent as `2026-09-30T15:00:00.000Z`. Return Postgres's own text. | Bug (honest results, I6) · Medium | Should (before beta) | **Fixed on branch `claude/optimistic-wright-prmmne`**, awaiting operator check and merge (integration 4b and H12 fail before, pass after) |
| 6 | **N5** Validator rejects ordinary names (`CustomerOrders2024`, purpose `QuarterlyBusinessReview`) as "encoded", and every validation failure returns the same `Invalid request`. | Bug · Medium | Should | Open |
| 7 | **N6** Output is capped by rows only; 2,000 wide rows have no byte cap. | Security · Medium | Should | Open |
| 8 | **N7** Equal-priority rules resolve by document order, so an allow listed first beats a deny. Deny should win ties. | Security · Low | Should | Open |
| 9 | **N4** Each receipt append re-reads the whole log; startup re-verifies every receipt (92 ms/request and 3.0 s startup at 20,000 receipts). | Performance · Medium | After (document the limit for beta) | Open |
| 10 | **N8** Loader accepts allow rules gated only on agent-claimed `purpose` without a warning. | Footgun · Low | After | Open |
| — | NEXT-001 deny-timing side channel | Security · Low | After | Deferred |

### Phase 4 work (after the Must items above)

| ID | Item | When | State |
|---|---|---|---|
| E2 | Receipt wording: README, STATUS and pitches state exactly what receipts guarantee and what they do not (not that every request was recorded, that the decision was correct, or that the host was uncompromised). Claims table: [VALIDATION-PLAN §3](VALIDATION-PLAN.md#3-what-we-claim-exactly) | Before the demo video | **Todo** |
| E3 | Beta tag: pin the exact commit given to testers and design partners | Beta day | Todo |
| E5 | Comparison harness (= validation V0): same seeded DB and 10 requests through native Postgres (role + view + logging), DBHub read-only, Boundary, and no live connection; results to `docs/evidence/` | Week of 2026-11-09 | Approved |

**Parked until a paying buyer needs it:** HTTP / remote transport (Grok, hosted
agents), more databases, SSO, multi-tenancy, hosted dashboard, compliance
framework.

### Ops items for Phase 3 / beta (not code)

| Item | Owner | State |
|---|---|---|
| GitHub Actions billing | Operator | Still locked on 2026-11-07 (PR #25 jobs got no runner, 0 steps). Operator plans to transfer the repo to `enkidagoat`; until CI executes it is **NOT_RUN** |
| Local host-isolation rehearsal | Operator | Done 2026-11-01 for a disposable host ([report](evidence/HOST-CUSTODY-2026-11-01/REPORT.md)); exclusive single-writer supervision and a restricted agent host are not proven |
| Beta tester / customer setup (read-only role, policy, per-person Claude Desktop and Codex config, first-run checks incl. Codex bypass check) | Operator | Drafted: [TEAM-SETUP](TEAM-SETUP.md); config verified end to end in a cloud run (per-person `caller` rule, spoofed caller ignored, receipts verify). Operator's Claude Desktop + Codex run open |
| Volume test data (~1,000 users, 5,000 orders, 2,500 analytics) so agents hit limits and truncation | Operator | Seed drafted ([DEMO §2b](DEMO.md#2b-volume-data-for-agent-testing-optional)); gates pass on it in a cloud run; operator's local run and Codex MCP pass open |

---

## Beta entry criteria (target Friday)

Beta means outside testers and design partners on **synthetic, disposable or
explicitly approved non-production data** only. It is not a production release
and does not change the production NO-GO.

1. Queue items 1–4 closed, each with a permanent failing-then-passing attack or test.
2. G1–G6 and the agent review pass locally on the beta commit, recorded with exit codes.
3. CI executed on the beta commit **if** billing is restored; otherwise recorded as NOT_RUN.
4. README states the beta scope, known limitations (open queue rows) and the stop conditions below.
5. Independent review: **not required for beta**, required for production.

**Stop-ship for beta:** any policy-denied row in a tool result, any write
reaching the database, a receipt that fails offline verification, or stub data
returned without `dataSource: "stub"`.

---

## Last verified

| Check | Result | Source |
|---|---|---|
| G1 `npm ci` · G2 typecheck | PASS | `d682414` (= code of `main` `d90797e`), 2026-11-07: operator local run (Windows, Docker PostgreSQL 16) and a cloud run (PostgreSQL 16) |
| G3 `npm test` | PASS, 84/84 (incl. H11) | same |
| G4 integration | PASS | same |
| G5 `npm run test:attacks` | PASS, 19/19 held (incl. N1a/N1b, N2, A7a/b/c) | same |
| Agent review C0–C10 incl. G6 offline receipt verification | PASS, 11/11, `live:true`, exit 0 | same |
| CI | **NOT_RUN** | Actions billing lock (no runner assigned) |
| Independent review | NOT_RUN | required for production only |

The operator's own local runs on 2026-11-01/02 are recorded in
[archive/STATUS-2026-11-02-pre-reorg.md](archive/STATUS-2026-11-02-pre-reorg.md)
and [evidence/HOST-CUSTODY-2026-11-01/](evidence/HOST-CUSTODY-2026-11-01/REPORT.md).

---

## Production blockers (Phase 5)

Independent security review · CI green on the exact tagged SHA · exclusive
single-writer supervision and a restricted agent host · checkpoint custody
outside the writer's administrator domain with human approval · physical
storage/power-loss and key-rotation drills. Checklist:
[RELEASE-CHECKLIST](RELEASE-CHECKLIST.md) · detailed rows:
[HOST-ISOLATION-CHECKLIST](HOST-ISOLATION-CHECKLIST.md).

---

## Document map

| Need | Read |
|---|---|
| Product, install, tool contract | [README](../README.md) |
| Agent entry and constraints | [AGENTS](../AGENTS.md) |
| Invariants, gates, release rules | [SDLC](SDLC.md) |
| Release and beta tick-list | [RELEASE-CHECKLIST](RELEASE-CHECKLIST.md) |
| Local demo and real testing | [DEMO](DEMO.md) |
| Setting up a team (Claude Desktop, Codex) | [TEAM-SETUP](TEAM-SETUP.md) |
| Commercial validation: offer, who to talk to, gates, logs | [VALIDATION-PLAN](VALIDATION-PLAN.md) |
| Host isolation and checkpoint custody | [HOST-CUSTODY-RUNBOOK](HOST-CUSTODY-RUNBOOK.md) · [HOST-ISOLATION-CHECKLIST](HOST-ISOLATION-CHECKLIST.md) |
| Red-team responsibility split | [REDTEAM-GAP-MAP](REDTEAM-GAP-MAP.md) |
| Reusable agent prompts P01–P14 | [agent-playbook/PROMPTS](agent-playbook/PROMPTS.md) |
| History (audits, checkpoints, old plans) | [archive/](archive/README.md) |
| Immutable raw results | [evidence/](evidence/) |

Software Research Studio's repository-knowledge method was used to organize
these documents. Studio is not a runtime dependency or linked product; the old
advisory mapping is in the archive.
