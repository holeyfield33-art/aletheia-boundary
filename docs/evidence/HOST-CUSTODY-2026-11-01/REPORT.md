# Host isolation and checkpoint custody rehearsal — 2026-11-01

Production disposition: **NO-GO**. Tested application HEAD: `1634c33d74468befbbc9ce39816e68c5639cb97e` (base/head unchanged). Only documentation and disposable drill tooling were added; no application implementation was changed. The existing untracked `docs/AGENT-REVIEW-2026-11-02.md` was preserved.

## Executed evidence

`npm run build`: exit 0. Minimal container image build: exit 0. `node scripts/host-drill/run.mjs docs/evidence/HOST-CUSTODY-2026-11-01/run-2`: exit 0. `node --check scripts/host-drill/run.mjs`: exit 0. `git diff --check`: exit 0. Fresh application build was staged before the final image build; its image ID, tested HEAD and policy SHA-256 are recorded in `run-2/RESULTS.json`.

The completed rehearsal recorded 26 expected outcomes, including deliberate demonstrations of missing host controls. This is **not** a score of 26 production security gates passed.

| Drill | Observed result |
|---|---|
| Real MCP and database | Tool discovery and constrained analytics reads succeeded against a separate synthetic Postgres fixture |
| Candidate export | Whole-chain CLI verification succeeded; existing candidate overwrite exited 1 and its file hash was unchanged |
| Anchored startup | Production-mode server served a schema call against disposable Postgres with matching retained anchor |
| Missing anchor | Startup exit 1: production requires checkpoint |
| Rolled-back valid prefix | Startup exit 1: history shorter than checkpoint |
| Corrupt anchor | Startup exit 1: checkpoint unavailable or invalid |
| Wrong-key anchor | Startup exit 1: checkpoint signing key mismatch |
| Custody permissions | UID 10001 writer could not overwrite/delete read-only checkpoint copies |
| Identity | Client-supplied admin became host-drill-reader in the persisted receipt |
| Signing key/log | Linux volume state 0700; key/log 0600 and UID 10001; UID 10002 was refused key access |
| Restricted agent probe | No DB connection, state/custody mounts or Docker socket in separate network-none container |
| Read-only role | Writable fixture role refused at startup for write privileges on four relations |
| Duplicate service name | Docker refused identical container name with exit 125 |
| Different-name second writer | **Could start and append** to same disposable volume; stale original writer then refused data. No global exclusivity demonstrated |
| Freshness | Old two-receipt anchor accepted lost third receipt; retained three-receipt anchor refused the same prefix |
| Database canary | Zero rows after drills |

## Limits and decisions still open

- **Current desktop is NOT ISOLATED.** Agent has host shell and Docker authority, and the original local fixture is published on port 5434. Inventory is in `host-inventory.json`; names alone do not prove absence of alternate DB paths.
- The restricted-agent container is a negative-access probe. An end-to-end isolated model runtime with an MCP-only broker was not deployed.
- Single writer is **NOT ENFORCED** against another Docker-authorized process using a different name. Simultaneous races were not attempted. Docker/volume administration must be inaccessible to the actual agent; add an exclusive supervisor if that cannot be guaranteed.
- Read-only custody is proven against the writer container, **not against the Docker/host administrator**. Same-administrator volumes do not establish independent custody or immutable cross-host retention.
- Human approval is **PENDING**. The harness used explicit rehearsal-only anchors; it did not approve or publish a production checkpoint. Byte-preserved review candidate: `candidate-integrity-correction/candidate-export-bytes.json`, file SHA-256 `dc205fcd2edb928b5e3e6129f014785af93fc0221b5be185a5e86a3551663908`. Original re-serialized artifact `run-2/candidate-for-human-review.json` is preserved as historical evidence only; its actual SHA-256 is `faa59f7b1a2ae1c18002be1f7d85a5cdc856bbb01f560688dde1fc0d271ddb57` and it is superseded for approval.
- Freshness policy **APPROVED by the operator on 2026-11-01**: anchor after each completed batch; pause before the next batch until checkpoint approval/publication. This approves the cadence only, not any candidate checkpoint or production deployment.
- Physical power-loss/ENOSPC, key rotation, independent review and release-commit CI were not run. Earlier integration/agent-review failures were not rerun or changed by this work.

## Artifacts, preservation and rollback

`run-2/RESULTS.json` indexes outcomes and retained volume names. `run-2/command-*.json` contains exact operator command results and exit codes, startup stderr and persisted tool responses. Synthetic DB URLs are redacted from command summaries. Private key bytes were never copied into evidence.

First attempt (`run-1`, exit 1) stopped on a JavaScript newline-escaping error in the drill harness, not a Boundary assertion; output is retained unchanged. Fixed the harness and replayed in entirely new disposable resources as `run-2`. Both runs' state/custody volumes remain for review. All drill DB containers and networks were removed; the original desktop DB/MCP settings remain active.

Files added: `scripts/host-drill/{Dockerfile,prepare.ps1,run.mjs}`, `docs/HOST-CUSTODY-RUNBOOK.md`, this evidence directory. `docs/STATUS.md` records the scoped findings. Rollback: stop any drill process, inspect the exact volume names in each run's RESULTS.json, then remove only those disposable volumes after review. Do not alter customer logs/keys/anchors. No commit, release or deployment was made.

Next: (1) choose a real agent isolation/supervisor arrangement; (2) implement the approved batch freshness policy and establish separate custodian authority, then perform a human-signed publication rehearsal; (3) give this evidence plus the pinned SHA and current STATUS to an independent reviewer.
## Current-main wording-fix verification — PR preparation

Before opening the documentation PR, reran `npm run test:integration` and `node --import tsx audit/agent-review.ts` on application SHA `1634c33d74468befbbc9ce39816e68c5639cb97e` against the original disposable Postgres fixture. Both exited 0; integration completed all assertions and agent review reported 11 PASS / 0 FAIL / 0 SKIP with nine persisted receipts verified offline. Raw stdout and exit codes are in [current-head-gates](current-head-gates/). This supersedes the earlier failure **for these two commands only**; the historical failed run remains accurate for SHA e536294. G1–G3/G5 and release CI were not rerun during PR preparation. No complete same-release-SHA gate pack or production promotion is claimed.

Checklist mapping: [annotated assessment](../../HOST-ISOLATION-CHECKLIST.md). The missing RELEASE-CHECKLIST.md reference and independent review remain open. The PR contains documentation and reproducible operator drill tooling, with no application runtime changes.

## PR #19 candidate artifact integrity correction

Confirmed the original harness removed the exported candidate's final LF by parsing/re-serializing JSON. Preserved the original artifact and recovered the exact 214-byte export from the retained read-only custody volume into `candidate-integrity-correction/candidate-export-bytes.json`. The corrected artifact matches the recorded export SHA-256. `candidate-integrity-correction/VERIFICATION.json` records source, command, byte equality, lengths and both fingerprints. No new checkpoint or human approval was created.

The harness now transfers base64-encoded file bytes, validates them against the verified export fingerprint, writes with exclusive creation, and derives the published fingerprint from the actual saved artifact. Candidate paths are excluded from Git text conversion to retain exact bytes across checkouts. Regression test covers final LF preservation, rejection of re-serialized bytes and refusal to overwrite. `node --test scripts/host-drill/candidate-artifact.test.mjs` exited 0 (1 pass); targeted retained-volume recovery/byte comparison exited 0; script syntax checks passed. Full container rehearsal and application suites were not repeated for this isolated artifact-handling fix. Base PR commit: `0a1c78acfda56541ec590d89ce08aebf6c45af2f`; production remains NO-GO.
