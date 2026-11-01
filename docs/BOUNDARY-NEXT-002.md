# BOUNDARY-NEXT-002 — Encoded / malformed agent request rejection

**Date:** 2026-11-01  
**Parent:** [BOUNDARY-NEXT-001](BOUNDARY-NEXT-001.md)  
**Studio freeze:** advisory only — [mapping](STUDIO-FREEZE-MAPPING.md)

**Production disposition:** **NO-GO** (unchanged)

## Intent

Close the **encoding / obfuscated identifier** gap for `boundary_request`
arguments **before** policy evaluation or data access.

## Delivered

| Control                                                                                 | Location                       |
| --------------------------------------------------------------------------------------- | ------------------------------ |
| Safe action enum                                                                        | `src/request/validate.ts`      |
| Resource: max length, no path/`..`, no control chars, no percent/base64/hex blob shapes | same                           |
| `*` only for `schema`                                                                   | same                           |
| Params allowlist: `columns`, `limit` only (rejects `sql`/`query`/unknown)               | same                           |
| Column identifiers: safe + not encoded                                                  | same                           |
| Purpose length + control-char reject                                                    | same                           |
| Wired at `Boundary.handle` entry                                                        | `src/boundary.ts`              |
| Unit tests                                                                              | `src/request/validate.test.ts` |

Invalid requests return **`ok: false`**, reason **`Invalid request`**, and still
get a receipt (sanitized body). Production remains **NO-GO** until CI + ops
blockers in NEXT-001 clear.

## Explicit non-goals

- Constant-time deny (side_channel) — still deferred
- Cross-process rate limits — host-owned
- Studio selector / freeze mutation
- Treating this as production GO

## Verify

```powershell
git pull
npm test
# optional live:
npm run test:attacks
npm run test:agent-review
```

## Studio citation pin (unchanged)

| Field                       | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Freeze ID                   | `SRS-FREEZE-2026-10-31-v1`                                         |
| Checkpoint                  | `STUDIO-KNOWLEDGE-003R`                                            |
| Freeze commit               | `89fe5485e37f315eab6b5131e715bcd2115bbe31`                         |
| `FROZEN_STATE.json` SHA-256 | `c46aa1beeb10185def012bef6cfd362bde7effc6e867febac0cf4154a0e61e18` |

---

_BOUNDARY-NEXT-002 is a code hardening increment. Independent of Studio
roadmap._
