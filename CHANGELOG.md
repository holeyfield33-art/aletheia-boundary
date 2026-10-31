# Changelog

## Unreleased - receipt writer exclusion (2026-10-30)

- Serialize verified startup snapshots and append/read/compare/sync operations with an exclusive filesystem lock directory on the canonical log path.
- Fail closed on contention, lost ownership or lock-release failure; never auto-expire or steal stale locks. A crash inside the critical section requires explicit operator quarantine after all writers stop and evidence is reconciled.
- Reject leaf symlinks and hard-linked logs; parent-directory aliases share one lock. Multiple idle processes are not a supported service topology; stale disk heads refuse append.
- Add `npm run test:writer-lock` and subprocess adversarial tests; extend all six kill/restart cases to distinguish crash-held locks from cleanly released operations.
- [Writer-lock handoff, dependency, evidence and recovery limits](docs/WRITER-LOCK-2026-10-30.md). Builds on PR #6 checkpoint controls. No production GO; CI stays deferred for billing.

## Unreleased - host-trusted receipt checkpoints (2026-10-30)

- Production MCP now requires `BOUNDARY_CHECKPOINT_PATH` pointing to a valid, nonempty checkpoint and matching existing receipt history. This is an operator configuration/migration requirement.
- Add strict checkpoint validation for version, full public-key SHA-256, receipt count and content hash; startup rejects deleted/shortened history, wrong-key anchors and valid forks that omit the trusted checkpoint.
- Offline `verify-log` accepts `--checkpoint` and `--export-checkpoint`; export verifies history, refuses empty logs and never overwrites an existing file. The host owns candidate approval and external publication.
- Add `npm run test:checkpoint` and permanent regressions for rollback, deletion, malformed anchors, production startup, export safety and the stale-floor limitation. Existing audit fixtures explicitly isolate their development checkpoint configuration.
- Verified extensions are permitted; losses after the retained checkpoint remain undetectable until it advances. No external-store/freshness service is claimed.
- [Checkpoint migration, evidence and remaining blockers](docs/CHECKPOINT-2026-10-30.md). CI remains deferred for billing; production NO-GO.

## Unreleased - process interruption recovery drill (2026-10-30)

- Add `npm run test:recovery`, also included in `npm test`: forcibly terminate a child at six append/sync/response phases, then verify offline and restart in a fresh process.
- Assert synced-prefix preservation, fail-closed partial-tail recovery without modification, linked continuation of complete logs and correspondence between returned data receipts and persisted evidence.
- Test-only filesystem wrappers live in an audit fixture; production request handling is unchanged.
- [Recovery evidence and limits](docs/RECOVERY-2026-10-30.md). Power loss, physical disk-full, cross-process writers, external checkpoints and independent review remain open. CI skipped for billing per user instruction; production remains NO-GO.

## Unreleased � security hardening candidate (2026-10-30)

Production remains **NO-GO**; no version/tag or production approval is implied.

- Disk receipts append and sync before publishing memory state or returning data; persistence failures poison the writer and return a sanitized MCP refusal without a receipt.
- Recovery verifies existing chains and rejects incomplete tails; offline verifier uses the same tail rule. Receipt access returns copies.
- Schema metadata intersects column/redaction restrictions across schema and reachable read paths.
- Provider/policy exception text is removed from public errors and receipt decisions; unknown tool names are not echoed.
- Regression and adversarial coverage for production guards, host caller identity, persistence faults/recovery/concurrency, schema metadata, errors and malformed identifiers.
- Production probe guard also applies to the exported Postgres factory. MCP agent review uses Node directly on Windows and runs offline persisted-chain verification; CI includes both.
- Repair the Zod lockfile mismatch that blocked baseline `npm ci`.
- Verification, recovery limits, blockers and handoff: [hardening evidence](docs/HARDENING-2026-10-30.md).

---

## [0.0.10] — 2026-10-30

### Security

- **GHSA-mrhx-c7xc-m3w5 / zod:** upgrade to `zod@^4.6.7`; policy schema arrays use `.max()` so oversized collections fail before element-level issue accumulation.
- Triage notes: [docs/SECURITY-SCAN.md](docs/SECURITY-SCAN.md)

### Changed

- Package / MCP version **0.0.10**

---

## [0.0.9] — 2026-10-30

### Fixed

- Honest `stats.truncated` (fetch limit+1, drop extra)

### Added

- Agent review harness; CI workflow scaffold; redteam gap map

---

## [0.0.8] — 2026-10-30

F9/F10 bounds + schema filter + glob match

## [0.0.7] — 2026-10-30

F1 structured SQL only

## [0.0.6] — 2026-10-29

F2/F6 receipt integrity

## [0.0.5] — 2026-10-29

F3–F5 fail closed

## [0.0.4] — 2026-10-29

F7/F8 gates real
