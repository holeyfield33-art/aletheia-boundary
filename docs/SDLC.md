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
