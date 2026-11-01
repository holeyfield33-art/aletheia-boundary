# Studio freeze ↔ Aletheia Boundary mapping

**Freeze:** [software-research-studio-freeze-2026-10-31](https://github.com/holeyfield33-art/software-research-studio-freeze-2026-10-31) (`SRS-FREEZE-2026-10-31-v1`, checkpoint `STUDIO-KNOWLEDGE-003R`)

**Purpose of this document:** orient Boundary work against the frozen Studio research baseline and the UNIVERSAL-ARCH-001 design candidate. **Advisory only.**

| Claim | Status |
|---|---|
| Studio dataset integrity (003R) | GO (per freeze) |
| Studio novel-input selector reliability | **NO-GO** |
| Studio product integration | **NO-GO** |
| Boundary production | **NO-GO** |
| This mapping as a product contract | **No** — design aid only |

Do not import the 003R selector, mutate the freeze, or treat Studio records as Boundary runtime authority. MOTHERSHIP / D-004 remain separate evidence domains (per freeze boundaries).

---

## 1. Control loop vs Boundary surface

UNIVERSAL-ARCH-001 proposes one loop: **understand → assess risk/evidence → select work → specify → execute bounded change → verify → decide → update state**.

Boundary implements a **narrow slice** of that loop at the data edge:

| Loop step | Boundary role today | Boundary does *not* own |
|---|---|---|
| Understand / intake | Host supplies structured `boundary_request` args | Project diagnosis, repo snapshot interpretation |
| Assess risk / select | Local policy evaluate + fail-closed defaults | Lifecycle work selection, Studio selector |
| Specify | Policy constraints (columns, limit, redact, sample) | ADRs, task DAGs, product requirements |
| Execute bounded change | Structured read only; no free-form SQL; row/rate/concurrency caps | Code edits, deploy, multi-tool orchestration |
| Verify | Receipts, chain verify, checkpoints, unit/adversarial suites | Independent human release decision |
| Decide / release | Deny or allow-with-constraints + receipt | Product GO/NO-GO, Studio integration authority |
| Update state | Append-only receipt log; host-retained checkpoint floor | Full project event graph, multi-writer merge |

---

## 2. UNIVERSAL-ARCH modules → Boundary components

| UNIVERSAL-ARCH module | Closest Boundary artifacts | Fit | Notes |
|---|---|---|---|
| Project intake and diagnosis | MCP args (`action`, `resource`, `params`, `purpose`); host env | Partial | `purpose` is a claim, not authentication. Client `caller` is ignored; host sets `BOUNDARY_TRUSTED_CALLER`. |
| Research registry adapter | This freeze (read-only); `docs/agent-playbook`, gap map | Out of process | Pin freeze digests if citing; do not rewrite freeze contents from Boundary. |
| Risk and selection evaluator | `PolicyEngine`, policy YAML, fail-closed load | Strong (data path only) | No network side effects in evaluate path. Abstain = deny / error, not invent allow. |
| Specification and artifact graph | Constraints on decision; schema projection (F10) | Partial | No ADR/task graph. Schema omits denied tables and restricted columns. |
| Bounded executor adapter | `PostgresProvider` / `StubProvider`; MCP `boundary_request` | Strong | Capability boundary is host + process; tool schema rejects free-form SQL. Grants are env/process, not prompt text. |
| Verification and review | `ReceiptLog`, `verify-cli`, checkpoint K-suite, recovery R-suite, hardening H-suite, concurrency R1–R7, `audit/attacks.ts` | Strong (library evidence) | Negative results retained in tests. Independent human review still required for production. |
| Lifecycle and state coordinator | Single-writer receipt append + fsync; checkpoint minimum-history floor | Partial | Process-local writer serialization; not a cross-process lock. Multi-writer deferred (host-owned). |
| Human decision interface | Operator policy authoring; checkpoint approval; production config | Host-owned | Boundary does not present product options UI. |

Trust rule shared with UNIVERSAL-ARCH: external content (tool args, model text, issue text) is **untrusted**. User/host configuration and verified decisions travel on a **trusted control channel** (`BOUNDARY_*` env, key/checkpoint paths). Sanitization of agent text is not treated as sufficient authorization.

---

## 3. Studio selector failure modes → Boundary lessons

003R selector is **NO-GO** for generalization. Known issues still inform Boundary hardening language:

| Studio failure (003R) | Boundary analogue | Local posture |
|---|---|---|
| False “missing fact” rationale when justification + owner present | Wrong or stale deny/limit reasons | Prefer fixed public errors; operator policy `reason` text must stay free of secrets; do not claim a missing condition that is present |
| Cross-field auth / write authority contradictions | Client `caller` vs host identity; `purpose` vs real authority | Host identity wins (H8); `purpose` never sole basis for privilege |
| Malformed facts → unhandled AttributeError | Bad MCP args / bad policy document | Fail closed on policy load; structured params only; no unhandled throw to agent with secrets |
| Unjustified tool/side-effect obligations when features excluded | Implying writes, export, or extra tools | Read-only probe; no free-form SQL; limit denials before policy/data path |

These are **design reminders**, not a claim that Boundary implements the Studio selector.

---

## 4. Local evidence vs Studio-style gates

Boundary already holds permanent tests that line up with several verification ideas in the freeze/architecture candidate. Labels below are **in-repo evidence**, not Studio GO or production approval.

| Concern | Boundary evidence | Command / location | Residual limit |
|---|---|---|---|
| Policy fail-closed | F4/F5 load rejects; default deny | `src/policy/failclosed.test.ts`, `bounds.test.ts` | Customer can still write a bad allow rule |
| Structured data path only | F1; attacks A1–A7 | `audit/attacks.ts`, provider asserts | Encoding dual-use in `purpose` not decoded |
| Honest truncation | F9 `stats.truncated` | limits + postgres provider | — |
| Schema minimization | F10, H5/H10 | `boundary.ts`, hardening tests | Conservative intersection may hide more than a looser read path |
| Receipt integrity | F2; H1–H4/H9 | receipt tests, hardening | Physical disk-full / power loss not proven |
| Process interruption | Recovery six phases | `npm run test:recovery` | Not MCP transport disconnect; not multi-writer |
| Trusted checkpoint floor | K1–K10 | `npm run test:checkpoint` | Stale floor; rollback of log+checkpoint together |
| Host caller identity | H7/H8 | hardening MCP tests | No per-session auth |
| Process-local resource limits | R1–R7 | `src/data/concurrency.test.ts` | Cross-process quotas host-owned |
| Sanitized errors | H6/H8 | hardening | Operator policy text still visible |

Studio freeze verification (dataset schema/graph, 13-case oracle, manifest) lives **only** in the freeze repo. Boundary does not re-run those oracles.

---

## 5. What to reuse from the freeze (practices, not code)

Safe to copy as *process*:

1. **Immutable baseline + verify script** — same spirit as Boundary checkpoint export + `verify-log`.
2. **Explicit GO/NO-GO split** — dataset integrity vs selection reliability vs product integration (Boundary already splits unit green vs production NO-GO).
3. **UNIVERSAL-ARCH read order** — Evidence → Architecture → Coverage → Policy → Contracts → Roadmap → Review when writing new Boundary design notes.
4. **Agent playbook alignment** — `docs/agent-playbook` phases (Pin → Specify → Design → Implement → Verify → Release review → Handoff) sit comfortably next to the universal lifecycle responsibilities table.

Do **not**:

- Submodule the freeze as mutable application code
- Call Studio selection GO from Boundary docs
- Begin Stage 004 / commercial Studio features from this mapping
- Treat `coverage.json` / `evidence-index.json` as proof that Boundary implements those research IDs

---

## 6. Suggested Boundary follow-ups (optional)

Prioritized against current Boundary gap map, informed by this mapping—not a Studio roadmap:

1. Normalize deny timing (side_channel) — reduces oracle surface analogous to “honest reasons.”
2. Keep process-local limits documented in operator-facing README (see concurrent docs PR if open).
3. When citing Studio research in future ADRs, pin **freeze ID + content hash**, never “latest main.”
4. Only after an explicit product decision: consider a *separate* research note that lists which `gate.*` / `practice.*` IDs are *aspirational* for Aletheia Core vs enforced in Boundary today.

---

## 7. References

| Resource | Location |
|---|---|
| Freeze repository | https://github.com/holeyfield33-art/software-research-studio-freeze-2026-10-31 |
| Freeze state | `FROZEN_STATE.json` in that repo |
| Architecture candidate | `architecture/UNIVERSAL-ARCH-001/` |
| Unexecuted selector fix directive | `next_unexecuted/STUDIO_KNOWLEDGE_003R2_DIRECTIVE.md` |
| Boundary SDLC | [SDLC.md](SDLC.md) |
| Boundary agent playbook | [agent-playbook/README.md](agent-playbook/README.md) |
| Boundary redteam gap map | [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md) |
| Checkpoint handoff | [CHECKPOINT-2026-10-30.md](CHECKPOINT-2026-10-30.md) |

---

*Document version: 2026-11-01. Production remains NO-GO. Studio selector and Studio integration remain NO-GO.*
