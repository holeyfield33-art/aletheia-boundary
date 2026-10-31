# Official supplemental development workflow

## Phase 0 — Pin baseline
Record exact base SHA, Node/OS/Postgres versions, policy hash, key fingerprint (never private key), relevant documents, threat boundaries, and current production decision. Stop if the target revision is ambiguous.

## Phase 1 — Specify
State the customer-facing outcome, threat model, non-goals, changed trust boundaries, acceptance tests and rollback. Do not broaden product scope.

## Phase 2 — Design
Inspect existing TypeScript modules, MCP tool contract, policy engine, Postgres provider and receipt chain. Prefer minimal changes; review identity, data projection, fail-closed behavior, checkpoint custody and single-writer assumptions.

## Phase 3 — Implement
One bounded change per reviewable PR. No weakening of tests, schema, security invariants or receipts. Require approval for dependency changes, migrations, secrets, deployment and destructive operations.

## Phase 4 — Verify
G1 npm ci; G2 npm run typecheck; G3 npm test; G4 Postgres npm run test:integration; G5 npm run test:attacks; agent review npm run test:agent-review; G6 offline receipt verification with an independently held checkpoint where applicable. Record commands, exit codes, environment and actual artifacts. NOT RUN is not PASS. Independently test attack cases and host assumptions.

## Phase 5 — Release review
Independent security review, CI on exact release commit, host raw-DB bypass prevention, key/checkpoint custody, durability and recovery drills, resource limits, installation and rollback evidence. Any missing mandatory gate or unauthorized release is NO-GO. Never tag or deploy automatically.

## Phase 6 — Handoff
Record base/head SHA, files changed, exact test evidence, open findings and owners, GO/NO-GO, rollback plan and next three actions. Update README, CHANGELOG, docs/SDLC.md and security gap map only with verified claims.

## Stop-ship
Unauthorized data release; writable production DB path; fail-open policy; unsigned, lost or forged mandatory evidence; production stub or probe bypass; compromised checkpoint assumptions; missing release-commit gates; unreviewed identity trust.

## Present blockers (2026-10-31)
Production NO-GO. CI blocked by billing (NOT RUN). External checkpoint custody/publication and freshness, single-writer/host isolation, physical storage recovery, key/ACL operations and independent review remain open. Check current upstream docs before acting.
