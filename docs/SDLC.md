# SDLC: how aletheia-boundary is built, verified and released

This is the process every change follows, whoever writes it: a person, Claude,
or any other model in a relay. It exists because this product's whole value is
that someone else can trust it. A boundary that is mostly right is a leak.

---

## 1. Who the user is

The user is an **AI agent** calling `boundary_request`. Its operator is the
customer who owns the data, the policy and the signing key.

- **Agent:** can I tell what happened from the tool result alone?
- **Customer:** can I prove later what was released and under which rule?

---

## 2. Invariants

| ID | Invariant | Enforced by | Status (0.0.9) |
|---|---|---|---|
| I1 | Policy decides on what actually executes | A1–A3 | **Passing** |
| I2 | Nothing leaves beyond the permitted projection | A1, A2; integration | **Passing** |
| I3 | Fail closed | A4, A5; MCP startup | **Passing** |
| I4 | Receipts are evidence | A6; `verify-log` | **Passing** |
| I5 | No writes | integration; A7 | **Passing** |
| I6 | Agent contract (reasons, bounds, dataSource, honest truncation, schema filter) | bounds; agent review C1–C9 | **Passing** |

---

## 3. Stages

### 3.3 Verify (gates)

| Gate | Command |
|---|---|
| G1 | `npm ci` |
| G2 | `npm run typecheck` |
| G3 | `npm test` |
| G4 | `npm run test:integration` |
| G5 | `npm run test:attacks` |
| G6 | `npm run verify-log` |
| Agent | `npm run test:agent-review` |

### 3.4 Review

1. **Agent review** — `npm run test:agent-review` · [AGENT-REVIEW-2026-10-30.md](AGENT-REVIEW-2026-10-30.md) (10/10; re-run after 0.0.9 for C5 `truncated=true`)
2. **Adversarial** — [AUDIT-2026-10-29.md](AUDIT-2026-10-29.md) + `test:attacks` (7/7 HELD)

### 3.5 Release

- Stay on `0.x` until CI is green on `main`.
- MCP reports package version.

---

## 6. Work order

| Step | Scope | Status |
|---|---|---|
| 1–5 | Audit F1–F11 | **Done** (0.0.4–0.0.8) |
| 5b | Agent review | **Done** (2026-10-30) |
| 5c | Honest `stats.truncated` | **Done** (0.0.9) |
| 6 | CI G1–G5 | **Workflow in repo** — enable after Actions billing (Monday) |

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
