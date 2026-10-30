# Changelog

All notable changes to Aletheia Boundary are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow semver; `0.x` until all SDLC invariants I1–I6 are fully enforced.

---

## [0.0.7] — 2026-10-30

### Fixed

- **F1 / I1:** Free-form SQL (`params.sql` / `params.query`) is rejected. The boundary builds `SELECT … FROM <resource>` only. Policy `resource` is the table that executes.
- Attack suite A1–A3 now **HELD** (previously leaked SSNs/emails from `public.users`).

### Changed

- MCP tool schema documents structured params only (`columns`, `limit`).
- Example policy and integration tests use real table names (`public.analytics_daily`, `public.orders`).
- Package / MCP version **0.0.7**.

### Evidence

- `npm run test:attacks` → `{"leaks":0,"total":7}`
- `npm run test:integration` → all assertions pass

---

## [0.0.6] — 2026-10-29

### Fixed

- **F2 / I4:** Receipt hashing used `JSON.stringify(body, Object.keys(body).sort())`, which dropped nested `request` / `decision` fields. Replaced with recursive `canonicalJson`. Forging deny→allow invalidates `contentHash`.
- **F6:** Receipt log verified on hydrate (corrupt line or broken chain → refuse to start). Shipped offline verifier: `npm run verify-log`.

### Added

- `src/receipt/canonical.ts`, `computeContentHash`, `verifyReceipt`, `verifyReceiptChain`
- `src/receipt/receipt.test.ts` (A6-style forge must fail)
- `src/receipt/verify-cli.ts`

### Evidence

- A6 HELD; unit tests for receipt integrity pass

---

## [0.0.5] — 2026-10-29

### Fixed

- **F3:** When `DATABASE_URL` is set and Postgres/probe fails, process exits 1 — no `StubProvider` fallback with `ok: true`.
- **F4:** Policy `effect` validated with zod; typos like `"denny"` reject at load.
- **F5:** Only implemented constraint types accepted (`columns`, `redact`, `limit`, `sample`). `aggregate` / `rows` rejected at load.
- Policy load failure refuses to start (exit 1).

### Added

- `src/policy/schema.ts` (zod)
- `src/policy/failclosed.test.ts`
- Response field `dataSource`: `"postgres"` | `"stub"`

### Evidence

- A4, A5 HELD

---

## [0.0.4] — 2026-10-29

### Fixed

- **F8:** Smoke tests use `node:test` + `assert` (failures exit non-zero).
- **F7:** `src/pg-cursor.d.ts`; `package-lock.json` committed for reproducible installs.

### Added

- `docs/SDLC.md`, `docs/AUDIT-2026-10-29.md`, `audit/attacks.ts` (from independent review PR)

---

## [0.0.3] — 2026-10-29

### Added

- Initial MCP server, policy engine, Postgres read-only provider, receipt log, docker integration harness.

### Known issues (closed in later releases)

- See [docs/AUDIT-2026-10-29.md](docs/AUDIT-2026-10-29.md). F1–F8 addressed in 0.0.4–0.0.7.
