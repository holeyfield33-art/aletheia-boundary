# SDLC: how aletheia-boundary is built, verified and released

This is the process every change follows, whoever writes it: a person, Claude,
or any other model in a relay. A boundary that is mostly right is a leak.

---

## 1. Who the user is

- **Agent:** calls `boundary_request`; must learn allow/deny/why/bounds/real-vs-stub from the tool result alone.
- **Customer:** owns policy, signing key, and the receipt log.

---

## 2. Invariants (0.0.9)

| ID | Invariant | Status |
|---|---|---|
| I1 | Policy binds to what executes | **Passing** |
| I2 | No over-release beyond projection | **Passing** |
| I3 | Fail closed | **Passing** |
| I4 | Receipts are evidence | **Passing** |
| I5 | No writes | **Passing** |
| I6 | Agent contract (incl. honest `truncated`) | **Passing** |

---

## 3. Verify (gates)

Install once:

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary && npm ci
```

| Gate | Command |
|---|---|
| G1 | `npm ci` |
| G2 | `npm run typecheck` |
| G3 | `npm test` |
| G4 | `docker compose up -d` then `DATABASE_URL=... npm run test:integration` |
| G5 | `DATABASE_URL=... npm run test:attacks` |
| G6 | `npm run verify-log -- --log logs/receipts.jsonl --pub keys/boundary.pub.pem` |
| Agent | `DATABASE_URL=... npm run test:agent-review` |

External adversarial corpus (gap hunt):

- Kit: https://github.com/holeyfield33-art/aletheia-redteam-kit  
- Map: [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md)

Every **boundary-owned** kit miss becomes a permanent row in `audit/attacks.ts`.

---

## 4. Review

1. **Agent review** — `npm run test:agent-review` · [AGENT-REVIEW-2026-10-30.md](AGENT-REVIEW-2026-10-30.md)
2. **Adversarial** — [AUDIT-2026-10-29.md](AUDIT-2026-10-29.md) + `test:attacks` + kit gap map

---

## 5. Work order

| Step | Status |
|---|---|
| F1–F11 + honest truncation | **Done** (0.0.9) |
| Agent review | **Done** |
| CI workflow | **In repo** — enable after Actions billing |
| Redteam-kit gap closure loop | **Ongoing** — see REDTEAM-GAP-MAP.md |


---

## 6. Purple-team handoff and release decision (2026-10-30)

**Current target:** package and MCP server report 0.0.10. **Production verdict: NO-GO pending remediation and reproducible verification.** This is not proof of exploitation. Historical local green results do not replace a fresh release-commit run. README/SDLC version references lag package metadata.

### Product boundary and explicit non-goals

Boundary is a **local Postgres-to-MCP data authorization and minimization enforcer**, not a process sandbox, network firewall, agent identity provider, or prompt-injection filter. It controls `boundary_request`; the host must ensure agents cannot access the database through alternative tools, credentials, or network paths. Do not promise that a cloud model never sees customer data: approved projections are returned to the model's tool context. State precisely that raw source access stays customer-controlled and only policy-authorized projections leave the boundary.

### Verified-by-source observations (not runtime reproduction)

- `src/mcp/server.ts` accepts client-supplied `caller` and `purpose`; `src/policy/engine.ts` may match policy on both. **P1 candidate:** identity spoofing if a policy trusts `caller`; `purpose` is an unverified claim. Test and either bind identity to trusted transport/host context or prohibit security-sensitive rules on untrusted attributes.
- `src/receipt/log.ts` advances in-memory chain before `appendFileSync`. **P0 candidate:** persistence failure can leave a chain/response mismatch; test unwritable path, disk full, partial append, and crash. Ensure no authorized data is returned without a durable, verifiable receipt; explicitly define durability and recovery guarantees.
- `src/boundary.ts` schema filtering checks table reachability but does not project column-level schema metadata. **P1 candidate:** accessible table metadata may disclose denied column names. Define and test the intended metadata policy.
- `src/boundary.ts` returns exception strings in decision reasons. **P1 candidate:** test for secret-bearing error disclosures and return sanitized public errors with local diagnostics.
- `src/mcp/server.ts` uses a dev StubProvider when `DATABASE_URL` is absent; `src/data/postgres.ts` accepts `BOUNDARY_SKIP_READONLY_PROBE=1`. **P0 production configuration gate:** refuse stub and probe bypass in explicit production mode.
- `docs/REDTEAM-GAP-MAP.md` acknowledges missing global rate/concurrency controls and timing side-channel normalization. Prioritize measurable resource exhaustion controls before broad production deployment.
- `.github/workflows/ci.yml` defines G1-G5, but no successful release-commit run has been established in this review.

### Required next-agent execution order

1. Pin and record target commit SHA, runtime, OS, DB version, policy hash, public signing-key fingerprint, and threat model. Read `README.md`, `docs/SDLC.md`, `docs/REDTEAM-GAP-MAP.md`, `docs/AUDIT-2026-10-29.md`, `src/boundary.ts`, `src/policy/engine.ts`, `src/data/postgres.ts`, `src/receipt/log.ts`, and `src/mcp/server.ts`.
2. Reproduce baseline G1-G5, G6, and agent review on the pinned commit with real Postgres. Record command, exit code, actual output, artifacts, and environment. A missing Docker host or blocked Actions billing means **NOT RUN**, never PASS.
3. Add adversarial regression cases for: forged `caller`/`purpose`; column-level schema leakage; SQL/identifier/JSON malformed inputs; error sanitization; missing DB configuration; probe bypass; log write failures, truncation, deletion and restart; concurrent requests and receipt chain order; resource exhaustion; key/log permission and rotation; and raw DB bypass via host misconfiguration. Use disposable fixtures and synthetic secrets.
4. For each case, record attack ID, objective, preconditions, payload, expected decision, actual tool result, independent oracle (DB/host/log), severity, and verdict **CONFIRMED / FALSIFIED / UNRESOLVED / NOT TESTED**. A test that fails to execute is not a security pass.
5. Remediate P0 and authorization P1 issues with minimal code changes. Turn every confirmed boundary-owned exploit into a permanent regression test; distinguish host-owned risks from product bugs.
6. Re-run all gates after remediation on the exact candidate SHA. Verify receipt chain offline and test interruption/restart. Review dependency lockfile, install, packaging, key custody, operational configuration and rollback.
7. Update `README.md`, `CHANGELOG.md`, threat model, agent review, red-team gap map and this SDLC with verified results. Keep marketing claims within demonstrated scope. Request independent review before tagging.

### Release matrix

| Release | Required evidence | Decision |
|---|---|---|
| 0.0.10 current | Source review only; current CI/runtime reproduction not established | **NO-GO production** |
| 0.0.11 hardening candidate | P0 fixed; security-sensitive P1 resolved; adversarial and integration regressions pass; production config documented | **Pending** |
| 1.0 production | All mandatory gates green on main at exact tag SHA; independent threat-model approval; verified log durability, host assumptions, operations and rollback | **Not authorized** |

**Stop-ship:** any confirmed unauthorized data release, forged or lost mandatory evidence, writable DB path, fail-open production mode, unreviewed policy-identity trust, or missing mandatory gate. No severity downgrade solely to meet a date. For bounded preview, explicitly list residual risks and prohibit real sensitive data until its applicable P0 gates pass.

### Handoff format for every future agent

At the end of a session, append a dated checkpoint to this SDLC or a linked review artifact containing: **base/head SHA; files changed; exact tests run and outputs; findings with evidence and disposition; open blockers and owner; current GO/NO-GO; next three actions; rollback instructions**. Never label a source inspection as a completed purple-team execution. Prefer a reviewable PR; do not merge or tag a production release without approval.
