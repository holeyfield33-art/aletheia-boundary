# Aletheia Boundary — agent prompt library

Replace bracketed fields. All prompts require evidence and must preserve existing product boundaries.

## P01 — Baseline reconnaissance
Read README.md, docs/SDLC.md, docs/CHECKPOINT-2026-10-30.md, docs/REDTEAM-GAP-MAP.md and relevant source. Pin SHA and summarize architecture, threat boundaries, tests and release blockers. Cite paths. Do not edit.

## P02 — Change specification
For [OUTCOME], identify the user, trust boundary, in/out scope, affected modules, acceptance criteria, negative tests and rollback. Do not implement yet.

## P03 — Minimal design
Compare at most two approaches to [CHANGE]. Prefer smallest safe diff. Analyze caller identity, policy-to-execution binding, row/column limits, data source honesty, receipts and checkpoint assumptions. State tradeoffs.

## P04 — Bounded implementation
Implement only approved [CHANGE]. Do not add dependencies or alter external contracts without approval. Preserve fail-closed behavior and existing tests. Report files, diff, actual checks and limitations.

## P05 — Policy and projection review
Trace resource, columns, row limits, schema discovery and provider execution for [PATH]. Propose tests proving denied data cannot appear in tool results. Distinguish code enforcement from policy-author risk.

## P06 — Identity and host isolation
Trace trusted caller context, purpose claims, DB credentials and alternative agent tools. Prove whether the host can bypass Boundary. Record host-owned gaps separately from product bugs.

## P07 — Receipt durability and checkpoint review
Test append/sync failures, restart, truncated tails, wrong keys, valid-prefix rollback, checkpoint freshness and independent custody using disposable logs. Never delete or repair evidence to make a test pass.

## P08 — Adversarial calibration
Build an attack matrix for [SURFACE] with payload, preconditions, expected result, actual tool output, independent oracle and verdict CONFIRMED/FALSIFIED/UNRESOLVED/NOT TESTED. Add confirmed boundary-owned misses as permanent regressions.

## P09 — Debugging
Reproduce [BUG] on pinned SHA; collect logs without secrets; rank hypotheses; isolate root cause; propose minimal patch and negative regression. Do not refactor speculatively.

## P10 — Test audit
Map acceptance criteria and invariants to tests. Identify missing boundary, malformed-input, concurrency, failure and recovery cases. Report what mocks do not prove. Do not count unrun tests.

## P11 — Release gate
On exact candidate SHA, enumerate G1–G6, CI, independent review, operations, isolation and rollback evidence. Mark each PASS/FAIL/NOT RUN/BLOCKED. Return GO/NO-GO; never deploy.

## P12 — Agent handoff
Summarize base/head SHA, changed files, tested commands/results, evidence artifacts, findings, open owners, rollback and next three actions. Update user-facing docs with bounded claims only.
