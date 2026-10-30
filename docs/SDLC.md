# SDLC: how aletheia-boundary is built, verified and released

This is the process every change follows, whoever writes it: a person, Claude,
or any other model in a relay. It exists because this product's whole value is
that someone else can trust it. A boundary that is mostly right is a leak.

The rules are written for this repo but carry no project-specific logic, so the
same document can be copied to other tools.

---

## 1. Who the user is

The user is an **AI agent** calling `boundary_request`. Its operator is the
customer who owns the data, the policy and the signing key. Every design and
review question is answered from those two seats:

- **Agent:** can I tell what happened from the tool result alone? Allowed,
  denied, why, how much I got, and whether it was real data.
- **Customer:** can I prove later, without trusting the vendor or this code's
  author, what was released and under which rule?

---

## 2. Invariants

These are the product. A change that weakens one is rejected, however useful it
is otherwise. Each invariant names the test that enforces it; an invariant with
no test is not enforced and must be listed as such in the README.

| ID | Invariant | Enforced by | Status (0.0.7) |
|---|---|---|---|
| I1 | **Policy decides on what actually executes**, never on a label the agent supplies. | `audit/attacks.ts` A1–A3 | **Passing** — structured queries only |
| I2 | **Nothing leaves beyond the permitted projection.** Column and redaction rules hold. | A1, A2; integration column asserts | **Passing** |
| I3 | **Fail closed.** Unknown effect/constraint, provider failure, refused probe or unreadable policy → deny or refuse to start. Never stub as real data. | A4, A5; MCP startup | **Passing** |
| I4 | **Receipts are evidence.** Hash covers full canonical body; offline verify command. | A6; `npm run verify-log` | **Passing** |
| I5 | **No writes.** Read-only role probe; READ ONLY transaction; always rolled back. | integration; A7 | **Passing** |
| I6 | **Agent contract.** Reasons on refusal; bounded/declared output; real vs stub visible. | integration; agent review | **Partial** — F9/F10 open |

---

## 3. Stages

### 3.1 Plan
- One change = one issue or one line in `docs/AUDIT-*.md`. Write down which
  invariant it touches and how it could leak if done wrong.
- If it adds a capability (new action, provider, constraint, policy feature),
  write the attack test **first**, before the code.

### 3.2 Build
- Branch from `main`; one change per branch; small pull requests.
- No new policy field, effect or constraint type unless the same change
  implements it, validates it, and tests it. The schema must reject anything it
  does not enforce.
- Code from any model is a draft until the gates pass. Nobody's output is
  trusted on its own say-so, including the reviewer's.

### 3.3 Verify (gates)
All must pass before merge. Run them locally until CI runs them.

| Gate | Command | Must show |
|---|---|---|
| G1 Clean install | `npm ci` on a fresh clone | exit 0, from a committed `package-lock.json` |
| G2 Typecheck | `npm run typecheck` | exit 0 |
| G3 Unit tests | `npm test` | `node:test`, non-zero exit on failure |
| G4 Integration | `npm run test:integration` against Postgres 16 from `docker-compose.yml` | all assertions pass, write canary empty |
| G5 Attack suite | `npm run test:attacks` | every attack HELD, exit 0 |
| G6 Receipt verify | `npm run verify-log` over a written log | whole chain verifies; one edited byte fails it |

A failing gate is fixed or the change does not merge. Never weaken, skip or
delete a test to get green. Every leak ever found becomes a permanent entry in
the attack suite.

### 3.4 Review
Two reviews, both required for anything touching I1–I4:

1. **Agent review.** Drive the MCP server as an agent would, with a real MCP
   client, and grade it on the checklist in section 5.
2. **Adversarial review** by a reviewer who did not write the change, and
   preferably a different model. Its only job is to get forbidden data out or
   forge a receipt. Findings go into `docs/AUDIT-*.md`.

### 3.5 Release
- Version `0.x.y` until all invariants are enforced by passing gates. Do not
  call anything 1.0 while any I1–I6 row is partial or failing.
- Every README claim names its evidence (gate or test). A claim without
  evidence is removed or moved to "Not yet enforced".
- The MCP server reports the package version.
- Changelog entry per release: what changed, which invariant, which gate proves it.

### 3.6 Operate
- The customer generates and holds the signing key; the boundary never sends it
  anywhere.
- Logs are verified on startup (refuse to start on a broken chain unless the
  operator explicitly rotates to a new log) and on demand with the verify command.

---

## 4. Definition of done

A change is done when:
- its invariant row names a passing test;
- G1–G6 pass on the branch (G6 when a log exists);
- the agent review and, for I1–I4, the adversarial review found nothing open;
- README and changelog say what it does and what it does not do.

"Works on my machine", "the model said it's fixed" and "tests pass" without G5
are not done.

---

## 5. Agent review checklist

Graded from the tool result alone, with a real MCP client:

| Check | Fails when |
|---|---|
| Errors carry reasons | a refusal or failure gives no actionable reason |
| Real or fake is visible | stub or degraded data is returned without `dataSource` |
| Bounded output | a single result can exceed the declared row/byte limit |
| Declared scope | the result does not say what rule and transforms applied |
| Honest completion | truncation or partial results are not flagged |
| Input handling | malformed, missing or oversized arguments do anything but a clean refusal |
| Repeatability | the same request on the same data gives a different release |
| Evidence | the receipt in the result cannot be checked against the log |

---

## 6. Work order from the 2026-10-29 audit

Ordered so each step makes the next one checkable.

| Step | Scope | Status |
|---|---|---|
| 1 | Make the gates real (F7, F8) | **Done** (0.0.4) |
| 2 | Fail closed (F3, F4, F5) | **Done** (0.0.5) |
| 3 | Receipts that prove something (F2, F6) | **Done** (0.0.6) |
| 4 | Bind policy to what executes (F1) | **Done** (0.0.7) — structured route |
| 5 | Bound the output and trim metadata (F9, F10, F11) | **Open** |
| 6 | CI running G1–G6 | **Open** (Actions billing) |

New providers (file/S3), a richer policy language and hardware-key storage wait
until step 5 is closed enough that expanding surface does not reintroduce F1-class leaks.
