# Archive

Superseded documents, kept for history. **Nothing here is current.** The only
living status and plan is [STATUS](../STATUS.md); stable rules are in
[SDLC](../SDLC.md).

These files were moved here on 2026-11-02 with `git mv`. The only edits were to
relative link targets, re-pointed so each link resolves to the same file it did
before the move; the text is otherwise unchanged (`git log --follow` shows the
full history of each file). Raw results under [`evidence/`](../evidence/) were
not moved or edited.

| File | What it was |
|---|---|
| [AUDIT-2026-10-29.md](AUDIT-2026-10-29.md) | First audit of 0.0.3: findings F1–F11 |
| [AGENT-REVIEW-2026-10-30.md](AGENT-REVIEW-2026-10-30.md) · [2026-10-31](AGENT-REVIEW-2026-10-31.md) | Generated agent-review reports (C0–C10) |
| [HARDENING-2026-10-30.md](HARDENING-2026-10-30.md) | Hardening H1–H10 handoff |
| [RECOVERY-2026-10-30.md](RECOVERY-2026-10-30.md) | Process interruption and restart drill |
| [CHECKPOINT-2026-10-30.md](CHECKPOINT-2026-10-30.md) | Trusted receipt checkpoint K1–K10 handoff and migration steps |
| [BOUNDARY-NEXT-001.md](BOUNDARY-NEXT-001.md) | Release-evidence hardening plan (deferred items now in STATUS) |
| [BOUNDARY-NEXT-002.md](BOUNDARY-NEXT-002.md) | Encoded / malformed request rejection (done in 0.0.11) |
| [SECURITY-SCAN.md](SECURITY-SCAN.md) | Security scan triage |
| [STUDIO-FREEZE-MAPPING.md](STUDIO-FREEZE-MAPPING.md) | Advisory mapping to Software Research Studio (not a dependency) |
| [agent-playbook-001/](agent-playbook-001/README.md) | Agent prompt package 001: START-HERE, WORKFLOW, SCANPLAN. The reusable prompts P01–P14 stay live in [agent-playbook/PROMPTS](../agent-playbook/PROMPTS.md) |
| [STATUS-2026-11-02-pre-reorg.md](STATUS-2026-11-02-pre-reorg.md) | STATUS as it stood before the reorganization, including the operator's 2026-11-01/02 run log |
| [SDLC-2026-11-02-pre-reorg.md](SDLC-2026-11-02-pre-reorg.md) | SDLC before the reorganization: historical invariant table, purple-team handoff, dated checkpoints §7–§9 |

The pre-reorg STATUS copy keeps one link to `AGENT-REVIEW-2026-11-02.md`, which
was broken before the move: that generated report was never committed. It is
left as it was rather than silently rewritten.
