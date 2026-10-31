# Hardening evidence and release handoff — 2026-10-30

**Production: NO-GO.** Reviewable hardening candidate; package/server remain 0.0.10.
Date is America/Los_Angeles; the generated agent report uses UTC (2026-10-31).

## Revision and environment

- Base main: `ab847a9d45ad9ee6e2df0c47c61f95c2cca9791d`; remote main rechecked unchanged during work.
- GitHub API confirms PR #1 merged at `edd83e1`, #2 at `54d4d56`, #3 at `ab847a9`; local ancestry includes all three.
- Tested implementation: `598e26cb5f3199a0ec1a0ad957c80805b2778449` (includes `7df60cd`). Subsequent documentation/evidence commits do not change application or test source. This is local branch evidence, not release-tag or main certification.
- Windows x64, Node 24.20.0, npm 11.19.0, Docker 29.8.2; compose Postgres 16.15 x86_64 Linux musl. CI targets Ubuntu / Node 22 and requires its own result.
- Synthetic fixtures only: compose `boundary` database, supplied readonly/writable test roles, policy `policies/example.yaml`.
- Policy SHA-256: `0e1ae8e06a58f6f417240dd3260bc0142de2aa03dfbc813bce20afddbec322fd`.
- MCP evidence public key ID: `ed25519:bdabc4791fd5b655`. Only its public key and synthetic receipt log are committed, never the private key.
- Threat model: agents control MCP arguments, not host environment, policy, key/log directories or database credentials. One trusted identity/process and one writer/log. Approved projections enter model tool context. This product does not isolate processes, authenticate users or prevent host-provided alternate DB access.

## Gate ledger

All final commands below exited **0**. Captured output is in [evidence/hardening-2026-10-30](evidence/hardening-2026-10-30/).

| Gate | Command | Result / artifact |
|---|---|---|
| G1 | `npm ci` | PASS after lock repair; prepare/build passed; [install.txt](evidence/hardening-2026-10-30/install.txt). Run at `7df60cd`; manifest/lock unchanged at tested implementation |
| G2 | `npm run typecheck` | PASS at tested implementation; [typecheck.txt](evidence/hardening-2026-10-30/typecheck.txt) |
| G3 | `npm test` | 29 PASS, 0 FAIL, 0 SKIP; [unit.txt](evidence/hardening-2026-10-30/unit.txt) |
| G4 | `npm run test:integration` | 10 integration assertions PASS against real compose Postgres; writable role refused, canary empty, six-receipt chain intact; [integration.txt](evidence/hardening-2026-10-30/integration.txt) |
| G5 | `npm run test:attacks` | 12 HELD, 0 LEAK; [attacks.txt](evidence/hardening-2026-10-30/attacks.txt) |
| Agent | `npm run test:agent-review` | MCP stdio, Postgres mode; 11 PASS, 0 FAIL, 0 SKIP; [generated report](AGENT-REVIEW-2026-10-31.md), [output](evidence/hardening-2026-10-30/agent-review.txt) |
| G6 | `npm run verify-log -- --log docs/evidence/hardening-2026-10-30/receipts.jsonl --pub docs/evidence/hardening-2026-10-30/signing-public.txt` | 9 persisted MCP receipts verified; [verify-log.txt](evidence/hardening-2026-10-30/verify-log.txt) |
| Dependency audit | `npm audit --json` | 0 vulnerabilities reported; [npm-audit.json](evidence/hardening-2026-10-30/npm-audit.json) |
| Diff hygiene | `git diff --check` | PASS |
| Release CI | GitHub Actions on exact PR/main/tag commit | Not established by local gates; inspect PR checks. No release-tag run performed |
| Independent review | Separate reviewer/threat-model approval | NOT RUN; automated agent checklist is not an independent security review |

G4/G5/Agent use `DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary` and
`DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary` (disposable fixture credentials).
Setup was `docker compose up -d`; database version queried with `docker compose exec -T postgres psql -U admin -d boundary -Atc 'SELECT version();'`.

Baseline G1 on main failed with `Invalid: lock file zod@3.25.76 does not satisfy zod@4.6.7`.
Other baseline gates were not run on untouched main. The lockfile was synchronized without widening
version ranges. One later integration attempt ran while clean install was replacing dependencies and
exited **127** (`tsx: command not found`); [failed-attempt output](evidence/hardening-2026-10-30/integration-interrupted-install.txt)
is retained. It is not a security result. Integration/attacks/review were rerun after install completed;
the successful final outputs above supersede that attempt.

## Findings and permanent regression evidence

| ID / severity | Objective, precondition and payload | Expected / actual | Independent oracle and disposition |
|---|---|---|---|
| H1 / P0 | Allowed data request, disk-backed log; inject append error (synthetic ENOSPC), one-byte short write, or fsync failure | No released result; chain memory unchanged; writer stays unavailable. All assertions pass | Disk log + last hash/count; short tail refuses restart. CONFIRMED defect in baseline source, remediated in tested cases; real hardware failure NOT TESTED |
| H2/H3/H9 / P0 | Restart after valid append; wrong key, signed-field edit, missing newline, partial JSON; delete/truncate/edit while serving | Valid restart verifies; damaged/wrong-key restart and changed-file append refuse; offline CLI rejects tail. PASS | Signature/chain verifier, actual temporary files and CLI exit status. Remediated for these cases; valid-prefix rollback across restart UNRESOLVED without external anchor |
| H4 / P0 | 20 concurrent allowed handles; mutate returned/original receipt-related objects | One verifiable persisted chain, independent snapshots. PASS | Reload disk and verify signatures/links. Single-process concurrency FALSIFIED as a leak in tested case; multiwriter NOT TESTED/supported |
| H5/H10 + A8 / P1 | Restricted columns/redaction, list schema; live users table allowed only `id`; broader per-table schema rule after restricted enumeration | No forbidden names/types/table entries; initial and per-table constraints intersect; visible stats recomputed; no hidden-table count. PASS | Explicit expected schema fixture and live DB catalog fixture. Source-confirmed gap remediated |
| H6/H8 + A9 / P1 | Policy/provider throw synthetic secret-bearing connection URI; remove active MCP log | Fixed public error, no secret/payload; storage refusal has no invented receipt. PASS | Serialized result + signed decision + MCP response; signature verification. Remediated for tested exception paths |
| H7 / P0 | Spawn actual MCP server with production missing DB or probe bypass | Exit 1 before connection; no dev stub. PASS | Child exit status/stderr; regression for merged PR #3. Exported Postgres factory also guarded (source change) |
| H8 / P1 | MCP policy requires trusted caller; send forged caller/purpose with unset host identity; then hostile caller with trusted host identity | Forgery denied; host identity wins; receipt records host identity. PASS | MCP result + persisted receipt caller. Client caller bypass FALSIFIED in these cases; purpose-only privilege policy remains unsafe |
| A10 variants / P1 | Broad query allow; semicolon, traversal and base64-like table identifiers | Deny/no payload. 3 HELD | Real Postgres provider results. Narrow cases only; general JSON fuzzing NOT RUN |

A1–A7 retain prior SQL, invalid-policy, receipt-forgery and write-canary regressions.
The tests are permanent in `src/hardening.test.ts` and `audit/attacks.ts`.
No external redteam-kit execution is claimed.

## Behavior and recovery contract

Disk log writes and fsync complete before memory chain state advances and before allowed data is returned.
Any persistence uncertainty permanently refuses further writes from that instance. Boundary library calls
reject; MCP returns `ok:false`, `data:null`, a fixed error and no receipt. Restart verifies loaded content;
verification cannot be disabled for disk logs. The offline verifier rejects an unterminated tail too.
A failed sync may leave a fully signed record on disk even though no data response was delivered.
A receipt records a decision and attempted release, not proof that a model received it.

Schema returns the conservative intersection of initial schema-request constraints, per-table schema
constraints and all reachable sample/query constraints. Redacted columns are hidden entirely. Tables
with only export access remain undiscoverable. Hidden-table counts are not returned; row/byte stats
describe the projected metadata. Host-authored policy reasons/constraint details remain public.

Stop the writer after any storage failure, preserve evidence, verify a copy with the original public key,
compare to externally retained head hashes/receipts, and restore only independently verified history.
Do not silently trim partial records or recreate deleted history. See README for operator instructions.

## Remaining blockers and owners

| Blocker | Owner | Evidence still required |
|---|---|---|
| Exact release commit CI and independent review | Maintainer/release reviewer | Successful main/tag gates, separate security review and accepted threat model; local Windows results do not certify Ubuntu Node 22 |
| Crash/power-loss and real ENOSPC recovery | Storage/operations owner | Process interruption at append/sync/response boundaries, physical disk-full/storage faults, verified recovery drill; mocked failures are not hardware evidence |
| History rollback/deletion across restart | Storage/operations owner | External trusted head checkpoints and retention. A signed local chain cannot detect a removed valid suffix or a wholly deleted/recreated log |
| Single writer, keys, permissions and rotation | Host/operations owner | Enforce one writer/log and directory ACLs, preprovision stable keys, backup/restore/rotation tests. No cross-process lock; Node lacks directory fsync here on Windows; nested-directory/power-loss durability unproved |
| Caller/purpose trust and raw DB bypass | Host/security owner | Isolate host env/credentials, separate process per identity, prohibit purpose-only privilege, demonstrate no alternate raw DB path |
| Resource and side-channel controls | Product/security owner | Concurrency/rate/memory/disk quotas and exhaustion tests; timing/size review. Full log is retained in memory and compared on each append; unsuitable for unbounded logs without operational bounds |
| External corpus/full fuzz campaign | Security reviewer | Run redteam kit, malformed JSON corpus and host campaign with independent oracles; NOT RUN this cycle |

The library no-path log remains in-memory for tests/dev only. POSIX directory fsync code was not
executed on this Windows host. Permissions, rotation, multiwriter and kill/power-loss tests were NOT RUN.
No broad production GO is supported by this evidence.

## Handoff, next actions and rollback

Changed application/test files: receipt log and verifier, Boundary, Postgres factory, MCP handler,
`src/hardening.test.ts`, both audit harnesses, manifest/lock and CI workflow. User-facing README,
changelog, SDLC, scan/gap map, current agent report and historical-report pointers are updated.
Inherited conflict markers in the historical agent report were removed; its old C5 contradiction is
explicitly labeled and not reused as current evidence.

1. Maintainer reviews the PR and obtains independent review; verify PR CI at its exact head and after merge.
2. Operations owner supplies external checkpoints/retention and runs crash/storage/key/permission recovery drills.
3. Security owner validates host identity and DB isolation, resource limits and external adversarial corpus before reconsidering release.

Rollback: stop MCP; preserve the key/log and independently checkpoint their head; revert the hardening
commits only on a review branch and rerun gates. Receipt JSON shape/signatures are unchanged, but
older software lacks fail-closed persistence protections. Keep production stopped/NO-GO; never
truncate or regenerate evidence to make old software start. No merge, deployment, tag or version bump
was performed by this hardening cycle.
