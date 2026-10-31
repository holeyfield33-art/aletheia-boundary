# Receipt writer exclusion handoff - 2026-10-30

**Production: NO-GO. CI: NOT RUN/deferred for billing at user instruction.**
This follow-up adds exclusive startup and append critical sections on a trusted local filesystem.
It does not implement a lifetime process lease, network-filesystem lock service or automatic stale-lock recovery.

## Dependency, revision and environment

- Main observed: `5173efb7f8f4bb31a86b12c9a4a919464e450cdb` (merged PR #5).
- Parent/dependency: open PR #6, branch `security/receipt-checkpoint`, pinned at `38977efb381fe25fd7454471070fcf7031839979`. This follow-up targets that branch so its review diff contains only writer-lock changes. Merge/review PR #6 first; retarget/reverify against main when appropriate. No merge was performed here.
- Runtime implementation: `8fc83612e9de7df0e8115edd00950961e5ba7144`. Final test implementation: `d6530c9be3c3388be6806da955c8136ae73a2c73`, which changes only writer test initialization synchronization and its disk oracle. Following documentation/evidence commits change no runtime/test source.
- Windows x64, Node 24.20.0, npm 11.19.0; Docker 29.8.2 and compose PostgreSQL 16.15 Linux x86_64 musl for live gates.
- Only disposable directories, preprovisioned synthetic keys, receipts and compose readonly/writable fixtures were used. No production locks, log, keys or checkpoint were changed.

## Runtime contract

`ReceiptLog` resolves parent-directory aliases to a canonical path and acquires `<log-path>.writer-lock`
with atomic directory creation. A PID/random-nonce marker plus directory identity are checked before
operations and cleanup. Startup holds the same lock while creating or reading/verifying the log and
checking its trusted checkpoint. Append holds it across disk comparison, write, file sync and ownership checks.
Disk/memory state is published only after clean lock release; a release failure also refuses the response.
Leaf symlinks, nonregular files and hard-linked logs are rejected to prevent alternate leaf lock names.

Contention refuses immediately: no queue, expiry, retry loop, PID liveness guess or clock-based lock stealing.
The losing append instance remains poisoned until operator recovery/restart. Another process that initialized
from the same earlier head cannot overwrite the winning successor: the locked disk comparison refuses it.
Multiple processes may initialize while idle, but only one cooperating critical section can run at once.
**The supported topology remains one service writer per log**; this is not multiprocess request coordination.

Normal completion removes only the owned nonce marker and empty lock directory. Cleanup never recursively
deletes unknown files or a replacement owner's lock. Ownership loss or release uncertainty leaves a lock
for explicit recovery. A crash inside a locked startup/append leaves the directory behind and blocks startup.
A crash after clean release leaves no lock and can restart if chain/checkpoint verification succeeds.

Guarantees require cooperating current binaries, trusted directory ACLs and a local filesystem with atomic
mkdir semantics. They do not cover raw filesystem writers, external lock deletion, old binaries that bypass
locking, network filesystems or compromised host administration. Preprovision stable signing keys; receipt
locking does not serialize initial key generation or perform key rotation. Windows mode bits alone do not
establish ACL security. Physical storage/power-loss behavior and other filesystems are not certified here.

## Stale-lock recovery procedure

1. Stop **all** possible writers on the host and establish that no other host/version can use the path. PID/age alone is not sufficient evidence that a lock is stale.
2. Preserve the complete log, signing/public key, independently approved checkpoint, lock directory and owner marker. Reconcile against externally retained receipts/checkpoints; verify a forensic copy offline.
3. If ownership is uncertain, or evidence is corrupt/shorter than the trusted checkpoint, keep the service stopped. Never remove a live lock, trim the log, regenerate keys or lower the checkpoint to make startup pass.
4. Under the host's reviewed recovery procedure, quarantine only the confirmed stale lock directory with a unique name on the same filesystem; retain it as evidence. This code provides no automatic unlock command.
5. Restart against the unchanged approved checkpoint and independently verify continuation. A partial tail still refuses after lock quarantine. Restore verified retained history under operations review when needed.

The automated drills perform quarantine only inside disposable fixtures after confirmed child termination
and retained-prefix/offline verification. No command here deletes or moves a real deployment lock.
The offline verifier can read without acquiring a writer lock; stop writers before forensic export/publication.
A valid local chain is not proof that an unanchored suffix has not been lost; PR #6's freshness limit remains.

## Permanent adversarial cases

| Cases | Objective / interleaving | Actual result and oracle |
|---|---|---|
| W1 | Nested startup/append while another operation owns the same lock | Refused; disk bytes unchanged; losing append stays poisoned |
| W2 | Two independently initialized processes read the same predecessor, then try successors | Winner publishes verifiable receipts; stale process refuses twice without a result; disk receipts exactly match winner's responses |
| W3 | Hold append inside critical section, attempt competing startup/write, kill owner, age lock, then recover | Competitors refuse; crash lock does not expire; disk chain independently verifies; explicit test-only quarantine permits linked recovery; poisoned loser still refuses |
| W4 | Suspend startup while its verification snapshot owns the lock | Other process cannot start/write; original evidence preserved; killed startup leaves stale lock |
| W5 | Parent junction/symlink alias and hard-linked log aliases | Parent aliases contend on same canonical lock; both hard-link names refuse; original bytes unchanged |
| W6 | Replace lock ownership after sync | Request refuses; memory head/count do not advance; replacement marker remains untouched; a synced but unreturned receipt may remain |
| W7 | Inject lock-directory release failure | Response refuses and instance stays poisoned; uncertain lock retained; new startup refuses |
| W8 | Actual MCP startup under a held lock, then after clean release with approved fixture checkpoint | Held startup exits 1 with no MCP output; clean startup succeeds. PASS in default development-stub and production-Postgres modes |
| R-six-phase | Kill before append, mid-record, before sync, after sync, before response and after response | First four retain locks and refuse restart until explicit test quarantine; final two have released locks. Partial tail still refuses; complete histories verify/continue; returned receipt equals persisted record |

Tests live in `src/receipt/writer-lock.test.ts` and the updated `src/receipt/recovery.test.ts`;
controlled child behavior is confined to audit fixtures. No test-only switches were added to production.
A filesystem release permission failure is injected, not a real ACL/power-loss certification.

## Validation ledger

Final gates below exited **0**. Evidence: [writer-lock-2026-10-30](evidence/writer-lock-2026-10-30/).
G1/G4/G5/Agent ran at runtime commit `8fc8361`; runtime and those harnesses are identical at final test commit
`d6530c9`. G2/G3/targeted writer tests ran at `d6530c9`. This is branch evidence, not release-tag certification.

| Gate | Command / actual result | Artifact |
|---|---|---|
| G1 | `npm ci`, prepare/build PASS; install audit reports 0 vulnerabilities | [install.txt](evidence/writer-lock-2026-10-30/install.txt) |
| G2 | `npm run typecheck` PASS (existing production-source configuration) | [typecheck.txt](evidence/writer-lock-2026-10-30/typecheck.txt) |
| G3 | `npm test`: 53 PASS, 0 FAIL, 0 SKIP; W1-W8 plus all prior regressions | [unit.txt](evidence/writer-lock-2026-10-30/unit.txt) |
| Targeted writer | `npm run test:writer-lock`: 8 PASS, including actual production/Postgres W8 | [writer-lock-postgres.txt](evidence/writer-lock-2026-10-30/writer-lock-postgres.txt) |
| G4 | `npm run test:integration`: all 10 assertions PASS; canary empty | [integration.txt](evidence/writer-lock-2026-10-30/integration.txt) |
| G5 | `npm run test:attacks`: 12 HELD / 0 LEAK (data-plane cases; writer cases are W1-W8) | [attacks.txt](evidence/writer-lock-2026-10-30/attacks.txt) |
| Agent/G6 | `npm run test:agent-review`: 11 PASS, 0 FAIL, 0 SKIP; nine persisted receipts verified | [output](evidence/writer-lock-2026-10-30/agent-review.txt), [report](evidence/writer-lock-2026-10-30/agent-review-report.md) |
| Candidate/export replay | Verify nine synthetic receipts, exclusively export candidate, verify with retained checkpoint: PASS | [export.txt](evidence/writer-lock-2026-10-30/export.txt), [anchored-verify.txt](evidence/writer-lock-2026-10-30/anchored-verify.txt) |
| Hygiene | `git diff --check` PASS | No whitespace errors introduced |
| CI | NOT RUN/deferred for billing at user instruction; no rerun/check polling | No green claim |
| Independent security review | NOT RUN | Separate reviewer still required |

An initial full suite exited **1**: 52 PASS / 1 FAIL. W2 incorrectly expected two concurrently starting
processes both to initialize despite startup exclusion; one correctly refused. The fixture now waits for
each initialized process before testing stale successors. The failed run is retained as
[unit-initial-startup-contention.txt](evidence/writer-lock-2026-10-30/unit-initial-startup-contention.txt);
the final full suite and targeted production writer suite pass. Earlier development assertions were also
corrected to compare canonical Windows paths and to distinguish crashes before versus after lock release.
No skipped or failed execution is counted as a security pass.

Reproduce the DB-free new tests:

```powershell
npm ci
npm run test:writer-lock
npm run test:recovery
npm test
```

For W8 against the synthetic compose database:

```powershell
docker compose up -d
$env:BOUNDARY_WRITER_TEST_DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
npm run test:writer-lock
Remove-Item Env:BOUNDARY_WRITER_TEST_DATABASE_URL
```

G4/G5/Agent used the same disposable readonly URL and
`DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary`.
Evidence includes a synthetic public key, log and candidate only; never use that candidate for deployment.
Key ID `ed25519:a9320a6314361ccf`; verified last hash
`e7d51edc0554f0eac54d43a0b463c6bdec2772c71b659f9a444a8f398afebb82`.

## Disposition, remaining blockers and handoff

**Disposition:** cooperating-process critical-section exclusion and stale-head refusal are implemented and
tested on this Windows local filesystem. The old compare/write race is protected for cooperating current
code. This is not a lifetime single-process lease, an availability guarantee or multiprocess-service support.

Still NOT TESTED/proven: deployment filesystem/ACL semantics and operator quarantine drill, external
checkpoint custody/monotonic publication/freshness window, physical power loss/ENOSPC, POSIX directory sync,
initial key-generation races/rotation/backup, host raw-DB bypass, MCP transport interruption, global resource
quotas/exhaustion, timing side channels, external corpus and independent review. CI remains deferred.

Next three actions:
1. Maintainer/reviewer: review/merge PR #6 first, review this dependent PR, then reverify the combined main candidate. No production GO is implied by either merge.
2. Host/operations owner: approve and exercise checkpoint retention and the stale-lock quarantine procedure on the intended deployment filesystem, with preprovisioned keys and verified ACLs.
3. Product/security owner: add bounded request admission/concurrency/resource controls and adversarial exhaustion tests; operations still owns real storage-fault/power-loss drills.

Rollback: stop all writers, preserve keys/logs/checkpoints and any lock evidence, and revert this follow-up
only on a review branch. Receipt JSON/signatures and checkpoint format are unchanged. Older binaries ignore
these locks; never run mixed versions on one log. Keep production stopped/NO-GO until equivalent protection
is verified. No deployment, merge, version bump, tag or real stale-lock recovery was performed here.
