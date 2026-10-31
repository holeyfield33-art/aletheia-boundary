# Boundary Agent SDLC and Prompt Package 001

Supplement to [the authoritative SDLC](../SDLC.md), not a replacement. Product is production NO-GO until the release gates and independent review are satisfied.

Read in order: root README, docs/SDLC.md, docs/CHECKPOINT-2026-10-30.md, docs/REDTEAM-GAP-MAP.md, then this package. Do not treat historical PASS results as fresh release evidence.

Scope: local Postgres-to-MCP authorization, data minimization, durable signed receipts, operator-owned checkpoints. Not an agent sandbox, identity provider, network firewall or prompt-injection filter. Approved projections may reach cloud model tool context.

Use [WORKFLOW.md](WORKFLOW.md) for the lifecycle and [PROMPTS.md](PROMPTS.md) for reusable agent directives. No runtime or deployment change is authorized by this package.

## New-agent entrypoint
Start at [START-HERE.md](START-HERE.md). Structured handoffs use [EVIDENCE-SCHEMA.json](EVIDENCE-SCHEMA.json); prompts P01–P14 are in [PROMPTS.md](PROMPTS.md).
