# Changelog

## Unreleased - N10 dates returned as stored (2026-11-07)

- **Bug (N10, honest results):** `date` and `timestamp without time zone`
  values were parsed by the driver into a JS Date at the server's local
  midnight and rendered in UTC, so on a UTC+9 host the stored `2026-10-01`
  reached the agent as `2026-09-30T15:00:00.000Z` (and as
  `2026-10-01T07:00:00.000Z` on a US Pacific host). The provider now returns
  Postgres's own text for these types and their arrays (`2026-10-01`,
  `2026-10-01 12:34:56`). `timestamptz` is unchanged.
- **Agent-visible change:** date values are now `YYYY-MM-DD` strings, not ISO
  timestamps. A full 500-row analytics result is about 7 KB smaller.
- Tests: integration step 4b (under `TZ=Asia/Tokyo`) and H12.
- `docs/DEMO.md` expected gate output updated (attacks 19, agent review 11/11).

## Unreleased - N9 MCP server reports the package version (2026-11-07)

- **Bug (N9):** the MCP server announced version `0.0.10` while the package
  is `0.0.11`. It now reads `version` from `package.json` at startup (from
  both `src/` and `dist/`) and refuses to start if the version is missing.
- Test: H11 in `src/hardening.test.ts` (fails before, passes after).
- Still open (not required for beta): rate-limit refusals write no receipt.

## Unreleased - N3 attack A7 reaches Postgres (2026-11-07)

- **Test gap (N3):** attack A7 sent free-form SQL that request validation
  refuses before Postgres, so it could not see a write. It is replaced by
  A7a (startup probe refuses the `writable` role), A7b (a write injected into
  the provider's own transaction is refused by `READ ONLY`, SQLSTATE 25006)
  and A7c (after an injected `SET LOCAL transaction_read_only = off`, the
  read-only role refuses the write, 42501). Each was confirmed to report LEAK
  with its layer removed.
- G5 now also connects as the fixture's `writable` role
  (`DATABASE_URL_WRITABLE`, default `postgres://writable:writable@localhost:5434/boundary`);
  if it is unreachable the suite exits 2 rather than passing.
- No product behavior change.

## Unreleased - N2 constraint values typed at load (2026-11-07)

- **Security (N2, High):** constraint values are now validated when the policy
  loads. `columns`/`redact` must be a non-empty list of plain column
  identifiers; `limit`/`sample` must be a positive integer. Previously
  `columns: "id"`, `redact: "ssn"` or `limit: "1"` loaded and were silently
  skipped, releasing all columns, unredacted, up to 500 rows.
- **Upgrade note:** a policy that relied on a mistyped value now refuses to
  load (fail closed), e.g.
  `rules.0.constraints.0.value: Invalid input: expected array, received string`.
- Tests: 15 load tests in `src/policy/failclosed.test.ts`; attacks N2 (3 rows)
  in `audit/attacks.ts` (LEAK before the fix, HELD after).

## Unreleased - N1 policy binds to the canonical table (2026-11-07)

- **Security (N1, High):** the policy engine now evaluates the same canonical
  `schema.table` key the Postgres provider reads. A bare request (`users`) and
  a bare rule pattern (`users`, `user*`) both mean `public.<name>`; patterns
  starting with `*` still match any schema. Previously a deny on
  `public.users` missed a request for `users` (and the reverse), releasing
  the table under a broader allow.
- Resource case handling fails closed: deny rules match regardless of case;
  allow rules (exact and glob) match case exactly, so an allow for
  `public.users` does not release a quoted `public."Users"`.
- Shared helper `src/policy/resource.ts` used by both the engine and
  `PostgresProvider.resolveTable`.
- Tests: 6 unit tests in `src/boundary.test.ts`; attacks N1a/N1b in
  `audit/attacks.ts` (both LEAK before the fix, HELD after).

## Unreleased - documentation reorganized (2026-11-02)

- Docs only; no code or behavior change.
- [docs/STATUS.md](docs/STATUS.md) rewritten as the single living plan: phases
  (done / current / next), the one-item queue N1–N9 from the 2026-11-02 re-audit,
  beta entry criteria and last verified results.
- [docs/SDLC.md](docs/SDLC.md) reduced to stable rules: invariants mapped to their
  tests, gates, working loop, dev / beta / production release matrix.
- Superseded dated reports and playbook 001 moved to
  [docs/archive/](docs/archive/README.md) with link targets re-pointed only.
- Re-audit evidence added under `docs/evidence/REAUDIT-2026-11-02/`.
- README states beta scope and known limitations; RELEASE-CHECKLIST gains a beta section.

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
- [Checkpoint migration, evidence and remaining blockers](docs/archive/CHECKPOINT-2026-10-30.md).
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
- [Recovery evidence and limits](docs/archive/RECOVERY-2026-10-30.md). Power loss,
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
- [Hardening evidence](docs/archive/HARDENING-2026-10-30.md).

## 0.0.10

- Initial public hardening series baseline.
