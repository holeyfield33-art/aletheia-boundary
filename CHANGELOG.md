# Changelog

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
