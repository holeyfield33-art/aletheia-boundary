# Validation plan: does anyone pay for this?

**Owner:** operator (founder). **Status of the plan:** current. Engineering
state and the queue live in [STATUS](STATUS.md); this page is the commercial
track that runs beside it. It is public on purpose: anyone may copy the
approach, the offer and the tools.

Sources: [market research 2026-11-02](evidence/MARKET-2026-11-02/README.md)
(desk research, all buyer facts inferred) and the red-team review of it in the
same folder. Labels below: **OBSERVED** (checked in a source), **INFERRED**
(reasoning), **PROPOSED** (a threshold we chose, not a market fact).

---

## 1. The decision

**CONDITIONAL GO** for paid, **non-production** design-partner pilots.
**NO-GO** for production deployments and scaled marketing.

Boundary works in tests. What is not shown is that a buyer will pay for its
extra control and audit evidence instead of using what Postgres already
offers (roles, views, row-level security, logging). The next weeks answer
that question before building anything larger.

**Not built until a paying buyer needs it:** HTTP/remote transport (Grok,
hosted agents), more databases, SSO, multi-tenancy, a hosted dashboard, a
compliance framework.

---

## 2. The one question

> Can Boundary produce useful, independently checkable evidence of AI
> database-access decisions that a buyer cannot get as easily from their
> existing setup?

Answered by the comparison experiment (V0, built as engineering item E5) and
by buyer conversations (V4). **A valid answer is "no, native controls are
enough".** If so, stop selling Boundary as a needed extra security layer.

---

## 3. What we claim, exactly

Use these words in pitches, the README, the video and the offer.

| Claim | Status |
|---|---|
| Each allowed and denied request is decided against the customer's own policy | True by design; tested (G4, G5, agent review) |
| Only allowed columns, row limits and redactions leave; never free-form SQL | True by design; open bugs N1, N2 until fixed |
| Each receipt is signed; altering or deleting recorded receipts is detectable against a trusted checkpoint | True; tested (H1–H10, K1–K10) |
| Every request was recorded | **Not proven by receipts.** Rate-limit refusals write none (N9); a compromised host could skip writing |
| The decision was correct | **Not proven by receipts.** A receipt shows what was decided, not that the policy was right |
| The signing host was not compromised | **Not proven.** Host security is the customer's (see [TEAM-SETUP](TEAM-SETUP.md)) |
| The model never sees the data | **False.** The model sees every value it is allowed to receive |

Docs that still overclaim are tracked as **E2** in [STATUS](STATUS.md).

---

## 4. Competitive facts (checked 2026-11-02)

| Alternative | OBSERVED | Where Boundary differs |
|---|---|---|
| [Bytebase DBHub](https://github.com/bytebase/dbhub) (MIT) | Postgres, MySQL, SQL Server, MariaDB, SQLite; stdio and HTTP; read-only mode, row limits, timeouts; parameterized SQL tools in `dbhub.toml`. No column restriction, redaction, per-request policy engine or signed receipts in its docs | Boundary: per-request policy, column/redaction projection, signed receipts. DBHub: more databases, HTTP, more mature packaging |
| [DBHub advisory GHSA-mwwr-p57h-56pf](https://github.com/bytebase/dbhub/security/advisories/GHSA-mwwr-p57h-56pf) (2026-06-24, CVE-2026-61788) | Read-only mode did not prevent writes before 0.22.6: the DB-level read-only setting never ran and a first-keyword SQL check let side-effecting `SELECT`s through | Boundary never accepts SQL text, so that class does not apply. State it as a design difference, not an attack on DBHub; Boundary has its own open bugs (N1, N2) |
| Postgres roles, views, RLS, logging | Built in, $0 licence | Essential either way; Boundary sits on top of a read-only role, it does not replace it. May be sufficient on its own |
| [Stacklok ToolHive](https://github.com/stacklok/toolhive) | Container isolation, identity/policy, audit, gateway (per its docs, undated) | Broader runtime platform; Boundary is a narrow data-level enforcer |
| Do not connect AI to live data | Export or synthetic datasets | Zero model exposure; can be the right answer |

---

## 5. Who to talk to first

INFERRED from desk research; treat as outreach hypotheses, not a ranking.

| Now | Why | Their first objection → honest answer |
|---|---|---|
| **1 · Small B2B SaaS** (CTO/eng lead; founder signs) | Customer security questionnaires, internal AI pilots | "A read-only role is enough." → Keep it. Boundary adds per-request column/row decisions and checkable receipts; the comparison (V0) shows the difference on your kind of data |
| **2 · Boutique MSP / AI consultancy** | They repeat Postgres-plus-AI setups for clients | "We can do this with permissions." → Yes. Boundary may save repeating the policy-and-audit part each time; try one reproducible install first |
| **3 · Internal data teams** running Claude Desktop or Codex | Asked to connect AI to customer tables | "Views and logs cover it." → They might. Run one workflow both ways and compare the evidence |

**Parked until production gate or a fit is proven:** healthcare, fintech,
legal (need independent review and assurance); accounting (rarely Postgres);
agencies and nonprofits (low urgency or budget).

**Screen before any pitch (V2):** uses Postgres · uses Claude Desktop or Codex ·
accepts synthetic or approved non-production data · has a named owner · has a
reason they need evidence of AI data access.

---

## 6. The design-partner offer (V1)

PROPOSED terms; adjust after conversations.

- **Scope:** one client organisation, one Postgres database, one local AI
  client (Claude Desktop or Codex), one approved workflow.
- **Data:** synthetic or explicitly approved non-production data only.
- **Delivered:** pinned Boundary version (beta tag), their policy file, a
  least-privilege role, per-person config ([TEAM-SETUP](TEAM-SETUP.md)),
  denial tests, receipt verification steps, rollback and runbook.
- **Not claimed:** production readiness, compliance, independent validation,
  full isolation.
- **Money:** fixed fee, **deposit before any work**, written acceptance
  criteria agreed up front. Desk-research test range (not buyer data): about
  $1,500–$4,500 per pilot, from 8–40 hours at $75–$150/hour.
- **Support:** stated hours and response time; end date; what happens after.

---

## 7. The work, in order

| ID | Item | Done when | State |
|---|---|---|---|
| V0 | Comparison experiment = engineering item **E5**: same seeded DB, same 10 requests through native Postgres (role + view + logging), DBHub read-only, Boundary, and no live connection. Record configuration time, data exposed, denial behaviour, audit evidence, verification effort, failure recovery, upkeep | Reproducible script + results in `docs/evidence/` | Week of 2026-11-09 |
| V1 | Design-partner offer (§6) as a one-page document | Written | Todo |
| V2 | Screening questions (§5) | Written | Todo |
| V3 | Three pitches, one per "Now" segment, each using V0 results | Written | Todo |
| V4 | 10–15 screened conversations | Each logged in §8 | Todo |
| V5 | 2–3 paid design partners | Deposits received | Todo |
| V6 | Hours log per install and per support request | Kept from the first install | Todo |

---

## 8. Logs (append rows; never rewrite)

**Conversations (V4).** No personal data: organisation type, not names.

| Date | Org type | Passed screen? | Pain stated in their words | Would pay for pilot? | Next step |
|---|---|---|---|---|---|

**Economics (V6).**

| Date | Partner (type) | Activity | Hours | Fee received |
|---|---|---|---|---|

---

## 9. Gates and kill criteria

PROPOSED thresholds, not market facts.

| Gate | Threshold | If missed |
|---|---|---|
| Qualified conversations | 10–15 that pass the screen | Keep going; do not pitch unscreened leads |
| Willingness to pay | Any of the first 10 qualified conversations would pay for a narrowly scoped pilot | If none would: **reassess the value proposition.** Do not add marketing or features |
| Paid partners | 2–3 with deposits | No implementation without a deposit |
| Economics | Pilot fee covers delivery and support hours | Raise the price or narrow the scope before taking more |
| V0 result | Boundary shows evidence native controls cannot easily give | If not: stop selling it as an extra security layer; keep it as an open-source tool |
