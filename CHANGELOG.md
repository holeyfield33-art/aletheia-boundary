# Changelog

## Unreleased - local gates green + checklist (2026-11-02)

- Local live verification on main (post PR #17): G1–G5 **PASS**, agent-review **11 PASS / 0 FAIL**, demo and MCP path exercised.
- Integration + C6 harness accept public reason `Invalid request` for free-form SQL shape rejection (merged PR #17).
- [docs/STATUS.md](docs/STATUS.md) E2E snapshot updated; [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md) §1 local gates checked off.
- **Production remains NO-GO** — CI, independent review, and host ops still open.

## Unreleased - process-local request limits (2026-10-31)

- Added process-local concurrency and rate limiting for `boundary_request`
  (token bucket).
  - `BOUNDARY_MAX_CONCURRENT` (default 4, hard max 32; 0 disables)
  - `BOUNDARY_RATE_LIMIT` (default 10/s, hard max 100; 0 disables)
  - `BOUNDARY_RATE_BURST` (default = rate, hard max 200; 0 disables)
- Limit rejections fail closed before policy evaluation or data access; no
  receipt is written for pure limit denials.
- Permanent unit coverage in `src/data/concurrency.test.ts` (R1–R7).
- Cross-process / multi-instance quotas remain host-owned. Production remains
  NO-GO.

## Unreleased - host-trusted receipt checkpoints (2026-10-30)

- Production MCP now requires `BOUNDARY_CHECKPOINT_PATH` pointing to a valid,
  nonempty checkpoint and matching existing receipt history. This is an operator
  configuration/migration requirement.
- Add strict checkpoint validation for version, full public-key SHA-256, receipt
  count and content hash; startup rejects deleted/shortened history, wrong-key
  anchors and valid forks that omit the trusted checkpoint.
- Offline `verify-log` accepts `--checkpoint` and `--export-checkpoint`; export
  verifies history, refuses empty logs and never overwrites an existing file.
  The host owns candidate approval and external publication.
- Add `npm run test:checkpoint` and permanent regressions for rollback,
  deletion, malformed anchors, production startup, export safety and the
  stale-floor limitation. Existing audit fixtures explicitly isolate their
  development checkpoint configuration.
- Verified extensions are permitted; losses after the retained checkpoint remain
  undetectable until it advances. No external-store/freshness service is
  claimed.
- [Checkpoint migration, evidence and remaining blockers](docs/CHECKPOINT-2026-10-30.md).
  CI remains deferred for billing; production NO-GO.

## Unreleased - process interruption recovery drill (2026-10-30)

- Add `npm run test:recovery`, also included in `npm test`: forcibly terminate a
  child at six append/sync/response phases, then verify offline and restart in a
  fresh process.
- Assert synced-prefix preservation, fail-closed partial-tail recovery without
  modification, linked continuation of complete logs and correspondence between
  returned data receipts and persisted evidence.
- Test-only filesystem wrappers live in an audit fixture; production request
  handling is unchanged.
- [Recovery evidence and limits](docs/RECOVERY-2026-10-30.md). Power loss,
  physical disk-full, cross-process writers, external checkpoints and
  independent review remain open. CI skipped for billing per user instruction;
  production remains NO-GO.

## Unreleased — security hardening candidate (2026-10-30)

- Fail-closed receipts: sync disk before publishing state or returning data;
  poison writer on uncertainty.
- Schema minimization intersects policy constraints; restricted column metadata
  omitted.
- Sanitized provider/policy/storage errors in results and signed receipts.
- Production refuses missing DATABASE_URL and read-only probe bypass; MCP
  ignores client caller identity.
- [Hardening evidence](docs/HARDENING-2026-10-30.md).

## 0.0.10

- Initial public hardening series baseline.
