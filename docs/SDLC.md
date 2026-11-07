# SDLC: how aletheia-boundary is built, verified and released

This page holds the **stable rules**: who the user is, the invariants and the
tests that guard them, the gates, the release matrix and the working loop.
Current state, queue and dates live only in [STATUS.md](STATUS.md). The previous
version of this page, with its dated checkpoints and historical plans, is
preserved verbatim at
[archive/SDLC-2026-11-02-pre-reorg.md](archive/SDLC-2026-11-02-pre-reorg.md).

Every change follows this process, whoever writes it: a person, Claude, or any
other model in a relay. A boundary that is mostly right is a leak.

---

## 1. Who the user is

- **Agent:** calls `boundary_request`; must learn
  allow/deny/why/bounds/real-vs-stub from the tool result alone.
- **Customer:** owns policy, signing key, and the receipt log.
- **Host operator:** owns everything outside the process: database role,
  network paths, alternative agent tools, checkpoint custody, single-writer
  supervision.

---

## 2. Product boundary and explicit non-goals

Boundary is a **local Postgres-to-MCP data authorization and minimization
enforcer**, not a process sandbox, network firewall, agent identity provider, or
prompt-injection filter. It controls `boundary_request`; the host must ensure
agents cannot access the database through alternative tools, credentials, or
network paths. Do not promise that a cloud model never sees customer data:
approved projections are returned to the model's tool context. State precisely
that raw source access stays customer-controlled and only policy-authorized
projections leave the boundary.

`caller` comes from host configuration (`BOUNDARY_TRUSTED_CALLER`); `purpose` is
an agent claim, never authentication.

---

## 3. Invariants and the tests that guard them

An invariant is only as strong as the test that would fail if it broke. Open
findings against an invariant are tracked in [STATUS.md](STATUS.md).

| ID | Invariant | Guarded by | Known open gap |
|---|---|---|---|
| I1 | Policy binds to what executes | attacks A1–A3, A10, N1a/N1b; H8 (caller spoofing); `validate.test`; N1 tests in `boundary.test` | — |
| I2 | No over-release beyond the projection | attacks A2, A8, N2, N6; H5, H10; `bounds.test` (row and byte caps) | — |
| I3 | Fail closed | `failclosed.test`; attacks A4, A5, N7; H7; K7 | — |
| I4 | Receipts are evidence (durable, chained, verifiable) | `receipt.test`; attack A6; H1–H4, H9; K1–K10; `recovery.test`; agent review C10 (G6) | N9 (rate-limit refusals unreceipted) |
| I5 | No writes | integration read-only probe and canary; attacks A7a (startup probe), A7b (`READ ONLY` transaction, SQLSTATE 25006), A7c (role privileges after a read-write escape, 42501) | — (the role is the primary write control: an injected `SET LOCAL transaction_read_only = off` before the first query re-enables writes, which A7c covers) |
| I6 | Agent contract, incl. honest `truncated`, `dataSource`, sanitized errors and values as stored | agent review C0–C10; attack A9; H6; H12 and integration 4b (dates unshifted under `TZ=Asia/Tokyo`); N5 tests in `validate.test` and `boundary.test` (specific, input-free refusal reasons) | — |

A new invariant or a confirmed boundary-owned exploit gets a permanent row in
`audit/attacks.ts` (or a unit test) that **fails before the fix**.

---

## 4. Gates

Install once:

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary && npm ci
```

| Gate  | Command                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| G1    | `npm ci`                                                                      |
| G2    | `npm run typecheck`                                                           |
| G3    | `npm test` (includes recovery and checkpoint drills)                          |
| G4    | `docker compose up -d` then `DATABASE_URL=... npm run test:integration`       |
| G5    | `DATABASE_URL=... npm run test:attacks` (A7 also uses `DATABASE_URL_WRITABLE`, default the compose `writable` role) |
| G6    | `npm run verify-log -- --log logs/receipts.jsonl --pub keys/boundary.pub.pem` |
| Agent | `DATABASE_URL=... npm run test:agent-review` (runs G6 as C10)                 |

Record every run with the commit, command and exit code. A run that never
executed is **NOT_RUN**, never PASS: a missing Docker host, a skipped suite, or
GitHub Actions blocked by billing all count as NOT_RUN.

External adversarial corpus (gap hunt):
[aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit) ·
responsibility map [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md). Every
**boundary-owned** kit miss becomes a permanent row in `audit/attacks.ts`.

---

## 5. Review

1. **Agent review:** `npm run test:agent-review` (C0–C10) on every candidate.
2. **Adversarial:** `npm run test:attacks` plus the kit gap map. Re-audits are
   recorded under [`evidence/`](evidence/) and feed the STATUS queue.
3. **Independent review:** a reviewer who did not write the change. Required
   for production; not required for beta.

---

## 6. The working loop

One item at a time, top of the STATUS queue first:

1. **Pick** the top open item in [STATUS.md](STATUS.md). Code work is limited
   to security fixes and bugs until STATUS says otherwise.
2. **Failing test first.** Write the attack or unit test that reproduces the
   item and confirm it fails on the current code.
3. **Smallest fix.** Change only what the item needs; no refactors or features
   alongside it.
4. **Local gates.** G1–G6 and the agent review pass on the branch; record exit
   codes in the PR.
5. **Merge** after the operator's local check.
6. **Update STATUS** in place: mark the item closed, update "Last verified".
   CHANGELOG only for behavior changes.
7. **Repeat.**

---

## 7. Release matrix

| Release | Data allowed | Required evidence | Decision owner |
|---|---|---|---|
| Dev | Synthetic / stub | G1–G3 | Implementer |
| Beta | Synthetic, disposable, or explicitly approved non-production | Beta entry criteria in [STATUS.md](STATUS.md): Must items closed with failing-then-passing tests; G1–G6 + agent review pass locally on the beta commit; CI executed if available, else NOT_RUN; README lists beta scope and known limitations | Operator |
| Production 1.0 | Customer data | All gates green in CI on the exact tagged SHA; independent review; host isolation and single-writer supervision proven; checkpoint custody outside the writer's domain; storage/power-loss and key-rotation drills; [RELEASE-CHECKLIST](RELEASE-CHECKLIST.md) complete | Operator + independent reviewer |

**Stop-ship (every release level):** any policy-denied row in a tool result,
any write reaching the database, a receipt that fails offline verification,
stub data without `dataSource: "stub"`, forged or lost mandatory evidence, a
fail-open production mode, or a missing mandatory gate. No severity downgrade
solely to meet a date.

---

## 8. Repository maintenance and operational assurance

This section adopts the maintenance and operations part of the
[OWASP Web Security Testing Framework](https://wstg.owasp.org/stable/3-The_OWASP_Testing_Framework/0-The_Web_Security_Testing_Framework/)
while retaining the invariants and gates above. The
[Studio repository-knowledge guide](https://github.com/holeyfield33-art/software-research-studio/blob/main/docs/REPOSITORY_KNOWLEDGE_LAYOUT.md)
informs it but adds **no runtime dependency, authorization, or new service**.

### Documents

| Role | Owner |
|---|---|
| Product contract | [README](../README.md) |
| Agent entry | [AGENTS](../AGENTS.md) |
| Current state and queue | [STATUS](STATUS.md) — the only living status |
| Stable rules | this page |
| Behavior changes | [CHANGELOG](../CHANGELOG.md) |
| Immutable raw results | [`evidence/`](evidence/) — never edited, never moved |
| Superseded docs | [`archive/`](archive/README.md) — moved with links re-pointed only |

Update in place. When a document is superseded, move it to `archive/` and point
to it; do not create another status page or a second agent entrypoint.

### Before and during changes

1. **Baseline.** Pin branch/HEAD, package version, lockfile, policy
   configuration and target environment. Do not invent approvals or display
   secrets.
2. **Oracles first.** Set success and failure oracles before implementation.
   Walk the code path before a detailed security review if it is unfamiliar.
3. **Smallest bounded change.** Preserve I1–I6. Keep host enforcement
   (alternative DB tools, checkpoint custody, single-writer, network and
   credential isolation) separate from in-process code. Do not weaken gates to
   make CI green.
4. **Verification.** Run `npm ci`, `npm run typecheck`, `npm test` on the exact
   candidate; for DB, policy, MCP or receipt changes also run integration,
   attacks and agent review against disposable Postgres, and offline
   `verify-log` when applicable.
5. **Configuration and release check.** Review `NODE_ENV`, read-only
   `DATABASE_URL`, trusted caller, probe, policy paths, file ACLs, keys, logs,
   host-owned checkpoint, rate/concurrency limits and alternative agent tools.
   Security testing against real services requires explicit authorization.
6. **Post-deployment verification** (only after an authorized deployment):
   least privilege and raw-DB bypass prevention, allowed/denied requests,
   actual projections, receipt chain and checkpoint consistency. Never trim,
   reset or re-anchor history. No deployment is authorized by this section.

### Ongoing health

| Trigger | Checks |
|---|---|
| Each code/config change | Diff, permission changes, relevant gates, agent contract, rollback, STATUS update |
| Before and after each release | Exact-tag CI, policy/secret/config review, receipt and checkpoint path, recovery readiness |
| Advisory, incident, unexpected allow/deny | Lockfile exposure, reachability, policy regression, canary/secret leak, key or history compromise; preserve original evidence |
| Periodic (proposed monthly; operator approves) | CI execution, open PRs, Node/npm advisories, config drift, read-only role, host bypass paths, checkpoint freshness, key rotation, runbooks and links |
| Ownership transfer or retirement | Credential revocation, key and log custody, retention, dependent agents; never destroy records automatically |

If an owner cannot be verified, record `UNKNOWN` and hold the affected
operation.
