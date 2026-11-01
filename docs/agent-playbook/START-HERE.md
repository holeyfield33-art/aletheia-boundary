# START HERE — Aletheia Boundary agent entrypoint (playbook 001.1)

**Authoritative policy:** [docs/SDLC.md](../SDLC.md). This playbook is supplemental. **Production NO-GO** at package authoring time; verify current status at the exact SHA before making claims. Do not assume these blockers remain unchanged.

## First five minutes
1. Record `git rev-parse HEAD`, branch, working-tree status, platform, Node version, and target deployment. Do not substitute a historical SHA for current HEAD.
2. Read root [README](../../README.md), [SDLC](../SDLC.md), [checkpoint handoff](../CHECKPOINT-2026-10-30.md), [gap map](../REDTEAM-GAP-MAP.md), and latest dated review. Confirm whether newer documents supersede the checkpoint.
3. Identify trusted caller, Postgres role, policy, receipt key/log, host-owned checkpoint, single-writer assumption and alternate DB/tool paths. Never print secrets or private keys.
4. Select one [prompt P01–P14](PROMPTS.md). Agree scope and acceptance criteria before editing.
5. At handoff, produce an evidence JSON record matching [EVIDENCE-SCHEMA.json](EVIDENCE-SCHEMA.json). Missing checks remain NOT_RUN/BLOCKED, never PASS.

## Verification commands (run only in suitable disposable environments)
- G1 `npm ci`
- G2 `npm run typecheck`
- G3 `npm test`
- G4 `docker compose up -d`, then `npm run test:integration` with fixture DATABASE_URL
- G5 `npm run test:attacks` with fixture DATABASE_URL
- Agent review `npm run test:agent-review` with fixture DATABASE_URL
- G6 `npm run verify-log -- --log <LOG> --pub <PUBLIC_KEY> --checkpoint <INDEPENDENT_CHECKPOINT>` when verifying anchored evidence. Never use a synthetic checkpoint as production custody proof.

Record actual stdout/stderr artifacts, exit codes and environment. The latest release-commit CI, independent review and operational drills are separate mandatory gates.

## Stop ship
Any unauthorized data release, writable production DB path, fail-open production mode, unverifiable mandatory receipts, compromised or stale checkpoint guarantees beyond approved limits, unreviewed caller trust, or missing mandatory evidence means NO-GO. Never bypass production startup refusal, reset receipt history, silently enable stub data or claim CI passed when jobs did not run.

## Known blockers at authoring (2026-10-31)
CI was billing-blocked; external checkpoint custody/publication and freshness, host bypass controls, storage/key recovery, single-writer constraints and independent review required further evidence. **Reconcile against current docs and commit before acting.**

## Prompt checklist
P01 reconnaissance · P02 specification · P03 design · P04 implementation · P05 policy/projection · P06 identity/host · P07 receipts · P08 adversarial · P09 debugging · P10 tests · P11 release · P12 handoff · P13 host assumptions · P14 checkpoint custody.
