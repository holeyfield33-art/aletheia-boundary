# Trusted receipt checkpoint handoff - 2026-10-30

**Production: NO-GO. CI: NOT RUN/deferred for billing at user instruction.**
This candidate adds fail-closed verification against an independently retained **minimum history**.
It does not implement a remote witness, automatic publication or checkpoint freshness guarantees.

> Follow-up: [writer exclusion](WRITER-LOCK-2026-10-30.md) adds local-filesystem operation locks. Check that handoff for dependency status and current evidence; the checkpoint ledger below remains its original snapshot.

## Revision and environment

- Base main: `5173efb7f8f4bb31a86b12c9a4a919464e450cdb`; GitHub confirms PR #5 merged there. Remote main was rechecked unchanged during validation.
- Tested application/test implementation: `0cbe4c27010fc59cfebdbd33f66f055cacc7aff0`; following documentation/evidence commit changes no runtime or test source.
- Windows x64, Node 24.20.0, npm 11.19.0, Docker 29.8.2, compose PostgreSQL 16.15 Linux x86_64 musl.
- Only temporary test keys/logs, synthetic receipts and disposable compose database fixtures were used. No production keys, history or checkpoints were changed.
- Shipped example policy SHA-256: `0e1ae8e06a58f6f417240dd3260bc0142de2aa03dfbc813bce20afddbec322fd`.
- Replayed evidence key ID: `ed25519:0ab383e2c53475a0`; full public-key SHA-256 `0ab383e2c53475a0b28c720e548d1dce11fecb98c5e990a001f4c9e5a6fb75dd`.

## Contract and trust model

A strict version-1 JSON checkpoint contains exactly:

```json
{
  "version": 1,
  "publicKeySha256": "<64 lowercase hex characters: SHA-256 of public-key SPKI DER>",
  "receiptCount": 9,
  "contentHash": "<64 lowercase hex characters: receipt hash at that position>"
}
```

`receiptCount` must be a positive safe integer. Unknown fields, bad hashes, unsupported versions,
empty histories and invalid JSON refuse checkpoint loading. Checkpoint files over 4096 bytes refuse loading.
The host must obtain and retain a checkpoint through an independently trusted process and storage domain.
The checkpoint is not itself signed or authenticated by its file format; its authority comes from custody.
A copy placed beside a writable log does not establish independent custody.

`ReceiptLog(keys, path, { checkpoint })` first requires an existing log, verifies its complete hash/signature
chain, then requires the checkpoint public key to match and the exact receipt at its pinned count to have
the pinned hash. A missing anchored log is never recreated. A shorter valid prefix, empty replacement,
wrong-key anchor or alternate valid fork omitting the pinned record refuses startup without rewriting history.
Verified extensions are accepted so an interrupted response or later valid receipts do not force a reset.

Production MCP now **requires `BOUNDARY_CHECKPOINT_PATH`**. Missing configuration refuses before DB
connection; invalid/missing checkpoint content or inconsistent history refuses before tools are exposed.
The checkpoint is loaded once at startup. The server never creates, advances or downgrades it automatically.
Existing in-process file-change checks still protect each append. Direct library users must explicitly
supply the checkpoint option; optional development/no-path logs provide no cross-restart rollback protection.

**Freshness limit:** a checkpoint is a minimum retained history, not a declaration of the latest head.
If the log extends beyond it, removing only that unanchored suffix remains undetectable. Rolling back both
log and trusted checkpoint is also undetectable. K9 permanently demonstrates this limitation and shows that
an independently advanced checkpoint detects the same removed suffix. Do not claim the entire rollback
problem is closed until external custody, freshness and retained-history guarantees are established.

## Migration and operator procedure

1. Stop all writers and preserve the existing signing key, public key, full log, prior retained receipts and checkpoints. Do not regenerate keys or reset the log.
2. Independently reconcile the local history with retained external evidence. A valid local chain alone cannot prove it has not already been rolled back. For a genuinely new install, establish an operator-approved initial nonempty history, such as a labeled synthetic deny receipt in an isolated nonproduction bootstrap session using the stable signing key.
3. Verify history with the previously approved checkpoint where one exists; export a **new candidate** to a previously nonexistent file. The CLI refuses unknown/missing/duplicate flags, invalid chains, empty checkpoint exports and file overwrites.
4. Independently approve monotonic advancement: require the prior anchor still in history, same approved key and a nondecreasing count. Durably publish outside the log writer's change/rollback domain using the host's approved storage process. Preserve prior versions and external receipts. The CLI's local export is not an atomic external publication mechanism.
5. Configure the host-controlled `BOUNDARY_CHECKPOINT_PATH` to the approved file and restart. On refusal, keep the service stopped and reconcile/restore verified history; never lower the checkpoint to make a damaged or shortened log start.
6. Set and review an advancement/retention schedule and maximum unanchored-loss window. Review permissions, backups, storage durability, key rotation and emergency recovery separately.

Example after independent reconciliation (paths are operator-owned examples):

```powershell
npm run verify-log -- --log logs/receipts.jsonl --pub keys/boundary.pub.pem --checkpoint C:/BoundaryTrust/checkpoint.json --export-checkpoint C:/BoundaryTrust/candidate-next.json
# Independently approve and durably publish the candidate through your host process.
$env:BOUNDARY_CHECKPOINT_PATH = "C:/BoundaryTrust/approved-checkpoint.json"
```

For first provisioning only, omit `--checkpoint` after baseline review. Do not omit it to refresh an existing
anchor from an unreconciled local log. The export creates a candidate with exclusive-create plus file sync;
no existing file is overwritten. Publication, directory durability, monotonic retention and remote freshness
are still host responsibilities. If export fails, do not trust or publish a leftover candidate file.
The committed evidence candidate below belongs only to synthetic test receipts, not to any deployment.

## Adversarial regression evidence

| Cases | Objective / payload | Actual result and independent oracle |
|---|---|---|
| K1 | Exact checkpoint and verified extensions | Accepted; full signatures and continuation verify |
| K2 | Delete log, replace with empty file, restore shorter signed prefix | Refused; missing file remains absent; retained bytes and external checkpoint unchanged |
| K3 | Valid alternate same-key fork, checkpoint from other key, corrupt extension | Refused; fork itself independently verifies, proving anchor mismatch rather than merely invalid signatures |
| K4 | Missing/malformed/oversized checkpoint, count 0/fraction/unsafe integer, bad hash/version/extra fields, no disk log | Refused through strict parser/loader/constructor |
| K5 | Export verified candidate; overwrite candidate/log; export corrupted chain or empty history | Only valid nonempty candidate exported; existing bytes preserved; invalid export creates no file |
| K6 | CLI checkpoint verification against missing/empty/rolled-back log | Exit 1; no repair or recreation |
| K7 | Production with DB configured but no checkpoint path | Exit 1 with explicit checkpoint requirement before connection |
| K8 | Actual MCP startup/request with matching anchor; repeat startup after rollback/deletion/missing anchor | Matching history serves expected dataSource; failures exit 1 without resetting log. PASS in development-stub and actual production-Postgres modes |
| K9 | Remove suffix newer than retained floor, then check advanced floor | Old floor accepts (documented residual); advanced floor refuses |
| K10 | Missing, misspelled and duplicate CLI checkpoint options | Usage exit 2; no silent disabling of requested verification |

Permanent source: `src/receipt/checkpoint.test.ts`. Existing receipt fault and six-phase process-kill tests
also remain in G3. The K8 production case uses only the synthetic compose readonly database; it is runtime
configuration coverage, not authorization to deploy real sensitive data.

## Gate ledger

All executed final commands exited **0**. Evidence directory:
[checkpoint-2026-10-30](evidence/checkpoint-2026-10-30/).

| Gate | Command / actual result | Artifact |
|---|---|---|
| G1 | `npm ci`, including prepare/build: PASS; clean install reports 0 vulnerabilities | [install.txt](evidence/checkpoint-2026-10-30/install.txt) |
| G2 | `npm run typecheck`: PASS (existing production-source configuration) | [typecheck.txt](evidence/checkpoint-2026-10-30/typecheck.txt) |
| G3 | `npm test`: 45 PASS, 0 FAIL, 0 SKIP; includes K1-K10 and six kill/restart cases | [unit.txt](evidence/checkpoint-2026-10-30/unit.txt) |
| Targeted checkpoint | `npm run test:checkpoint`: 10 PASS with production-Postgres K8 enabled | [checkpoint-postgres.txt](evidence/checkpoint-2026-10-30/checkpoint-postgres.txt) |
| G4 | `npm run test:integration`: all 10 assertions PASS; writable role refused; canary empty | [integration.txt](evidence/checkpoint-2026-10-30/integration.txt) |
| G5 | `npm run test:attacks`: 12 HELD, 0 LEAK (retained data-plane cases; checkpoint regressions are K1-K10) | [attacks.txt](evidence/checkpoint-2026-10-30/attacks.txt) |
| Agent/G6 | `npm run test:agent-review`: 11 PASS, 0 FAIL, 0 SKIP; verifies nine fresh persisted receipts | [output](evidence/checkpoint-2026-10-30/agent-review.txt), [report](evidence/checkpoint-2026-10-30/agent-review-report.md) |
| Checkpoint export | `verify-log` with `--export-checkpoint`: verified nonempty synthetic history; candidate exported | [export.txt](evidence/checkpoint-2026-10-30/export.txt) |
| Anchored offline replay | `verify-log` with `--checkpoint`: nine receipts and retained checkpoint verified | [anchored-verify.txt](evidence/checkpoint-2026-10-30/anchored-verify.txt) |
| Hygiene | `git diff --check`: PASS | No whitespace errors introduced |
| CI | NOT RUN/deferred at user instruction for billing; no manual rerun or check polling | No green claim |
| Independent review | NOT RUN | Separate reviewer still required |

Live commands used `docker compose up -d`, `DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary`
and `DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary` (disposable fixture credentials).
Targeted K8 production mode is enabled only by `BOUNDARY_CHECKPOINT_TEST_DATABASE_URL`:

```powershell
$env:BOUNDARY_CHECKPOINT_TEST_DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
npm run test:checkpoint
Remove-Item Env:BOUNDARY_CHECKPOINT_TEST_DATABASE_URL
```

Default `npm run test:checkpoint` needs no DB. The ordinary agent checklist explicitly uses its own
development checkpoint configuration and disposable keys/logs; K8 separately tests the real production
configuration. Existing historical generated reports are preserved, with this run's report stored separately.

Replay the committed synthetic public evidence (never use its candidate for deployment):

```powershell
npm run verify-log -- --log docs/evidence/checkpoint-2026-10-30/receipts.jsonl --pub docs/evidence/checkpoint-2026-10-30/signing-public.txt --checkpoint docs/evidence/checkpoint-2026-10-30/candidate.json
```

## Remaining blockers, handoff and rollback

**Disposition:** minimum-history rollback/deletion detection is implemented and tested when an independent
trusted checkpoint is supplied. Full operational rollback/freshness guarantees remain **partially open**.
The application still does not provide cross-process locking or a remote checkpoint/retention service.

Still NOT TESTED/proven: external checkpoint custody and monotonic/durable publication, acceptable
freshness window, actual machine power loss/physical ENOSPC, POSIX directory durability, MCP transport
interruption, key/ACL/rotation/backup drills, host raw-DB bypass prevention, resource exhaustion and external
adversarial corpus. Independent review and release-commit evidence remain required. CI is deferred, not passed.

Next three actions:
1. Operations/security owner: specify and exercise external checkpoint custody, advancement, retention and rollback recovery with an explicit maximum unanchored-loss window.
2. Product/security owner: enforce and test the single-writer assumption before broader resource/concurrency work; do not share one log across processes.
3. Operations/reviewer: perform deployment-filesystem storage/key/permission recovery drills and independent review while CI billing is deferred.

Changed runtime: checkpoint parser/loader and key fingerprint, ReceiptLog constructor and candidate creation,
MCP production startup, CLI verification/export and public exports. Changed tests: K1-K10 and isolated
checkpoint env settings in existing test/agent harnesses. README, changelog, SDLC, gap map, scan pointer and
prior recovery pointer are updated with the new configuration requirement and limits.

Rollback: stop MCP, preserve stable key/log plus all retained checkpoints, and revert this candidate only on
a review branch. Receipt JSON/signatures are unchanged. Older server code will not enforce the checkpoint;
keep production stopped/NO-GO until an equivalent independently verified protection is in place. Do not
remove or downgrade the checkpoint to bypass refusal. No deployment, merge, tag or version bump performed.
