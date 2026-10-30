# Changelog

All notable changes to Aletheia Boundary are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow semver; `0.x` until all SDLC invariants I1–I6 are fully enforced **and** CI is green on main.

---

## [0.0.9] — 2026-10-30

### Fixed

- **I6 / honest completion:** Queries fetch `limit+1` rows, release only `limit`, and set `stats.truncated: true` (and `data.truncated`) when more rows existed. Agent-review C5 now requires this flag.

### Added

- `audit/agent-review.ts` + `npm run test:agent-review` (MCP stdio client, SDLC §5)
- `.github/workflows/ci.yml` — G1–G5 (enable after Actions billing restored)
- `docs/AGENT-REVIEW-2026-10-30.md`

### Evidence

- Re-run: `DATABASE_URL=... npm run test:agent-review` → C5 `truncated=true`
- Prior gates remain green: unit, attacks `leaks:0`, integration

---

## [0.0.8] — 2026-10-30

### Fixed

- **F9 / I6:** Default row cap **500** (was 10_000). Hard ceiling **2000**.
- **F10 / I6:** `schema` omits tables the policy denies (or with no sample/query path).
- Resource matchers support `*contains*` globs (`*users*` → `public.users`).

### Added

- `src/data/limits.ts`, `src/policy/bounds.test.ts`

---

## [0.0.7] — 2026-10-30

### Fixed

- **F1 / I1:** Free-form SQL rejected; structured table/columns/limit only. A1–A3 HELD.

---

## [0.0.6] — 2026-10-29

### Fixed

- **F2 / I4:** Recursive `canonicalJson`; forge invalidates hash. A6 HELD.
- **F6:** Hydrate verifies chain; `npm run verify-log`.

---

## [0.0.5] — 2026-10-29

### Fixed

- **F3:** No stub fallback when `DATABASE_URL` set.
- **F4 / F5:** Zod policy; unknown effects/constraints rejected at load.

---

## [0.0.4] — 2026-10-29

### Fixed

- **F7 / F8:** Lockfile, `pg-cursor` types, `node:test` runner.

---

## [0.0.3] — 2026-10-29

### Added

- Initial MCP server, policy engine, Postgres provider, receipts, docker harness.

See [docs/AUDIT-2026-10-29.md](docs/AUDIT-2026-10-29.md) for the original findings (F1–F11 closed by 0.0.9).
