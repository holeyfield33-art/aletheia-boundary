# Aletheia Boundary

**Local, independent data-boundary enforcer for AI agents.**

The cloud model never touches your data. It asks this program.

Aletheia Boundary runs on the customer's machine (or in their VPC) next to the data. It decides what the agent may see, releases only the minimal cleaned projection, and writes a tamper-evident log that the customer owns and the AI vendor cannot edit.

> A visual rule alone cannot secure a system. Enforcement at the data boundary is the product; everything else is decoration.

---

## Why this exists

OpenAI, Anthropic, or any other model provider cannot credibly be the thing that controls and audits their own model's access to your data. The enforcement point has to be local and independent of them.

This is the independent layer that sits between any agent (cloud or local) and the data it wants to touch.

### The three jobs

1. **Decide**  
   Evaluate every request (read this table, export that file, run this query) against local policy. Allow, deny, or allow-with-constraints.

2. **Keep the data in**  
   Raw data stays local. Only what policy permits leaves the boundary — after column filtering, row filtering, identifier stripping, aggregation, sampling, or redaction.

3. **Log what actually happened**  
   Every decision and every release is recorded in a hash-chained, signed, customer-owned log. The vendor cannot rewrite history.

---

## Architecture

```
Cloud / local agent
        |
        |  MCP / HTTP / stdio tool call
        v
+-------------------------------------+
|        Aletheia Boundary            |
|  (runs next to the data)            |
|                                     |
|  1. Policy engine                   |
|     - local rules                   |
|     - purpose / context claims      |
|     - allow / deny / constrain      |
|                                     |
|  2. Data plane                      |
|     - minimizer / projector         |
|     - providers (Postgres first)    |
|                                     |
|  3. Receipt + log writer            |
|     - hash chain                    |
|     - Ed25519 signature             |
|     - customer-owned key            |
+-------------------------------------+
        |
        |  cleaned payload + receipt
        v
      Agent receives only what was allowed
```

Fail-closed by default. Policy miss, log failure, or provider error → deny.

---

## Status

**0.0.4** — SDLC step 1 in progress.

> **Not safe for real data yet.** The 2026-10-29 audit
> ([docs/AUDIT-2026-10-29.md](docs/AUDIT-2026-10-29.md)) found that `query`
> requests can release policy-denied data (F1), receipts can be edited without
> detection (F2), and the server serves stub data when the database probe
> refuses to start (F3). The write side holds. Fix order and release gates:
> [docs/SDLC.md](docs/SDLC.md). `npm run test:attacks` exits non-zero until
> these are closed.

### SDLC step 1 (make the gates real)

| Finding | Status |
|---|---|
| F8 smoke test cannot fail | **Fixed** — `node:test` + `assert`; failures exit 1 |
| F7 `pg-cursor` types break build | **Fixed** — `src/pg-cursor.d.ts` |
| F7 no lockfile | **Needs one local commit** — see below |

Generate and commit the lockfile (G1):

```bash
npm install --package-lock-only --ignore-scripts
git add package-lock.json
git commit -m "fix(F7): commit package-lock.json for reproducible installs (G1)"
git push
```

Then `npm ci` on a fresh clone should succeed.

### Still open (SDLC order)

2. Fail closed (F3, F4, F5) — zod policy validation; no stub fallback
3. Receipts that prove something (F2, F6) — canonical hash covers body; verify command
4. Bind policy to what executes (F1) — structured requests, no free-form SQL
5. Bound output and trim metadata (F9–F11)
6. CI running G1–G6

---

## Quick start

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm install

# Unit tests (real runner — failures exit non-zero)
npm test

# Attack suite (expected to fail until F1–F5 closed)
npm run test:attacks

# Integration test
docker compose up -d
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
export DATABASE_URL_WRITABLE=postgres://writable:writable@localhost:5434/boundary
npm run test:integration
```

---

## Design principles

1. **Customer owns the enforcement and the log.** Vendor cannot be judge of its own access.
2. **Fail closed.** Ambiguity or failure = deny.
3. **Minimize by default.** Release the smallest projection that satisfies the request under policy.
4. **Receipts are first-class.** Every decision is cryptographically attributable.
5. **Local first.** Works offline / air-gapped. Cloud is optional.
6. **One clear tool surface.** Prefer a small, well-specified MCP tool over a large API surface.

---

## License

Apache-2.0

---

Built by [Aletheia Sovereign Systems](https://github.com/holeyfield33-art) — the independent layer the platforms cannot be.
