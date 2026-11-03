# Re-audit: aletheia-boundary 0.0.11 (2026-11-02)

**Scope:** `main` at `0f59c4c` (PRs #1–#19 since the 2026-10-29 audit; 199 files,
~10,900 lines changed). Every source, test, audit and CI file read in full. Docs
checked for claims against evidence. No repository changes were made.

**Environment:** Linux, Node 22.23.4, PostgreSQL 16.15 (local server, recreated
fresh from `scripts/init-readonly.sql`, SCRAM auth, port 5434). Docker was not
available, so `docker-compose.yml` was reproduced by hand.

## Verdict

The 2026-10-29 findings that made the boundary leak are fixed in code. A fresh
clone passes every gate the repo claims, and all 12 attacks in the suite hold.
New attacks found two ways to get policy-denied rows out again, both caused by
the policy and the data path disagreeing about what the request means. Keep
production at NO-GO; STATUS's "F1–F11 closed" is not accurate for F1, F5, F11.

## Gates from a fresh clone (all reproduced)

| Gate | Result |
|---|---|
| G1 `npm ci` | exit 0 |
| G2 `npm run typecheck` | exit 0 |
| G3 `npm test` | 62/62 pass (real `node:test` runner) |
| G4 integration (live PG 16) | all checks pass |
| G5 `npm run test:attacks` | 12/12 HELD, exit 0 |
| Agent review C0–C10 incl. G6 offline verify | 11/11 PASS |
| `scripts/host-drill` test | pass |

## What the hardening fixed (verified by reading and by test)

- **F1:** free-form SQL is rejected before policy; the boundary builds `SELECT <cols> FROM "<schema>"."<table>" LIMIT n` itself, so the policy-matched resource is the table read.
- **F2/F6:** `canonicalJson` sorts keys recursively; every receipt hash is recomputed on verify; the log is verified on startup, refuses partial tails, out-of-band edits and wrong keys; an offline `verify-log` CLI and host-supplied checkpoint detect rollback.
- **F3:** a failed DB provider or refused read-only probe exits the server; stub mode is labeled `dataSource: "stub"` and refused in production.
- **F4/F5:** zod schema rejects unknown effects and constraint *types*.
- **F7/F8:** lockfile committed, types fixed, real test runner.
- **F9:** rows clamped to 500 default / 2,000 hard; truncation is honest.
- **F10:** schema output omits denied tables and restricted columns.
- Also: host-trusted caller (agent `caller` ignored), concurrency and rate limits, sanitized errors, append-only writer that poisons itself on any write failure.

## New findings

Severity: **High** releases policy-denied data. **Medium** weakens a stated
guarantee or agent usability. **Low** footgun or hygiene.

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| N1 | **High** | **Policy and data path disagree on the table name.** Policy matches the exact string the agent sent; `resolveTable` then rewrites a bare name to `public.<name>`. A deny written as `public.users` is skipped by a request for `users`, and a deny written as `users` is skipped by `public.users`, while any broader allow (`*`, `public.*`) releases the table. The shipped example only avoids this because its deny uses `*users*` globs. Exact matches are also case-sensitive while globs are case-insensitive. | Re-audit N1a: deny `public.users` + allow `sample *` → `users` released SSNs. N1b: deny `users` + allow `public.*` → `public.users` released SSNs. |
| N2 | **High** | **Constraint values are not validated.** `ConstraintSchema.value` is `z.unknown()`. `columns: "id"`, `redact: "ssn"` and `limit: "1"` (strings instead of an array / number) load cleanly and are then skipped by every `Array.isArray` / `typeof === "number"` check, so the rule releases all columns, unredacted, up to 500 rows. Same class as F5: accepted but not enforced. | N2: all three released `id,name,email,ssn`, 3 rows, transforms show no projection. |
| N3 | Medium | **A7 still tests nothing** (open Codex review comment on PR #1). Its SQL is now refused by request validation before Postgres sees it, so a working read-write escape would still score HELD. The write side is in fact protected by the role probe and `READ ONLY` transaction, but G5 does not prove it. | `audit/attacks.ts` A7; validation rejects any `params.sql`. |
| N4 | Medium | **Receipt log cost grows without bound.** Each append re-reads the whole log to detect outside edits; startup re-verifies every signature. At 20,000 receipts: 92 ms per request and 3.0 s startup, both linear. Every request including denials appends, so a busy or hostile agent degrades the service over days. | N6 measurement. |
| N5 | Medium | **Validator rejects ordinary names, and the agent cannot tell why.** `looksEncoded` flags any undotted mixed-case identifier of 16+ characters: `CustomerOrders2024`, `MonthlyRevenueByRegion`, purpose `QuarterlyBusinessReview` are refused. Every validation failure returns the same `Invalid request`, so the agent cannot correct itself. Agent-review C1 passes because it only checks that *a* reason string exists. | N5 output; `src/boundary.ts` returns the fixed reason. |
| N6 | Medium | **Output is bounded by rows only.** 2,000 rows of wide text or `bytea` columns have no byte cap, so one tool result can still flood an agent's context. C3 checks rows, not bytes. | `src/data/postgres.ts` `buildSelect`/`minimize`. |
| N7 | Low | Equal-priority rules resolve by document order, so an allow listed before a deny wins. Deny should win ties. | N4 test. |
| N8 | Low | `purpose` can be the only gate on a rule and is unlocked by the agent claiming it. README says purpose is not authentication (good), but the loader accepts purpose-only allow rules without a warning. | N3 test. |
| N9 | Low | MCP server still reports `0.0.10`; package is `0.0.11` (F11 not closed; STATUS acknowledges it). Rate-limit refusals write no receipt, so refused attempts are missing from the customer's audit trail. | `src/mcp/server.ts:29`; `concurrency.ts` header. |

## Documentation

- STATUS is the right idea and mostly honest (production NO-GO, CI and independent review NOT RUN, host controls open). It overstates "F1–F11 closed".
- `docs/` holds 155 files (808 KB) against ~5,000 lines of code: dated ledgers, evidence, an agent playbook. AGENTS.md routes readers to STATUS and SDLC, which helps, but the volume makes it hard for any agent to find what is actually true.

## Recommended fix order

1. **N1:** resolve the resource to its canonical `schema.table` (the same key `resolveTable` uses) *before* policy evaluation and in the schema filter, and match case consistently. Add attacks N1a/N1b.
2. **N2:** type every constraint value in the schema (`columns`/`redact`: non-empty `string[]` of safe identifiers; `limit`/`sample`: positive integer). Add attack N2.
3. **N3:** make A7 attempt a real write through a path that reaches Postgres (or assert the probe + `READ ONLY` directly).
4. **N4–N6:** incremental append check (size + tail hash instead of a full re-read), specific refusal reasons that do not reveal table existence, a byte cap on results.
5. **N7–N9:** deny wins ties, warn on purpose-only allows, read the version from `package.json`, receipt limiter refusals.

## Reproduce

```bash
npm ci
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary
npm test && npm run test:integration && npm run test:attacks && npm run test:agent-review
npx tsx audit/reaudit-new.ts     # new attacks (attached separately); 9 FAIL
```
