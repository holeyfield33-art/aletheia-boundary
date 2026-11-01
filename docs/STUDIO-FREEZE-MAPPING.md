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

### Immutable citation pin

| Field | Value |
|---|---|
| Freeze ID | `SRS-FREEZE-2026-10-31-v1` |
| Authoritative checkpoint | `STUDIO-KNOWLEDGE-003R` |
| Freeze repo commit | `89fe5485e37f315eab6b5131e715bcd2115bbe31` |
| `FROZEN_STATE.json` SHA-256 | `c46aa1beeb10185def012bef6cfd362bde7effc6e867febac0cf4154a0e61e18` |

Cite these identifiers (not “latest main”). Ledgers: [BOUNDARY-NEXT-001.md](BOUNDARY-NEXT-001.md), [BOUNDARY-NEXT-002.md](BOUNDARY-NEXT-002.md).

---

## 1. Control loop vs Boundary surface

UNIVERSAL-ARCH-001 proposes one loop: **understand → assess risk/evidence → select work → specify → execute bounded change → verify → decide → update state**.

Boundary implements a **narrow slice** of that loop at the data edge:

| Loop step | Boundary role today | Boundary does *not* own |
|---|---|---|
| Understand / intake | Host supplies structured `boundary_request` args; **shape + encoding validation** (NEXT-002) | Project diagnosis, repo snapshot interpretation |
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
| Project intake and diagnosis | MCP args; `assertSafeAgentRequest` | Partial | Encoded / path-like resources rejected. Client `caller` ignored; host `BOUNDARY_TRUSTED_CALLER`. |
| Research registry adapter | This freeze (read-only); playbook, gap map | Out of process | Pin freeze digests; do not rewrite freeze from Boundary. |
| Risk and selection evaluator | `PolicyEngine`, policy YAML | Strong (data path) | Abstain = deny. |
| Specification and artifact graph | Constraints; schema projection (F10) | Partial | No ADR/task graph. |
| Bounded executor adapter | Postgres / Stub providers; MCP tool | Strong | Free-form SQL rejected. |
| Verification and review | Receipts, H/K/R/recovery suites, attacks | Strong (library) | Human review still required for production. |
| Lifecycle and state coordinator | Single-writer receipt append | Partial | Cross-process lock host-owned. |
| Human decision interface | Operator policy + checkpoint approval | Host-owned | |

Trust rule: external content is **untrusted**. Host configuration is the **trusted control channel**.

---

## 3. Studio selector failure modes → Boundary lessons

| Studio failure (003R) | Boundary analogue | Local posture |
|---|---|---|
| False “missing fact” rationale | Wrong deny reasons | Fixed public errors; no secret leakage |
| Cross-field auth contradictions | Client caller vs host | Host identity wins |
| Malformed facts → crashes | Bad MCP args | Fail closed validation + policy load |
| Unjustified side effects | Implied writes | Read-only probe; no agent SQL |

---

## 4. Local evidence (not production GO)

| Concern | Evidence |
|---|---|
| Policy fail-closed | `failclosed.test.ts` |
| Structured path + encoding reject | attacks A1–A7; `request/validate.test.ts` |
| Honest truncation | F9 |
| Schema minimization | F10 / H5 |
| Receipts / recovery / checkpoint | H/K/recovery suites |
| Process-local resource limits | R1–R7 |

---

## 5. Practices to reuse from freeze (not code)

1. Immutable baseline + verify script  
2. Explicit GO/NO-GO split  
3. UNIVERSAL-ARCH read order for design notes  
4. Agent playbook phases

Do **not** submodule the freeze, call Studio selection GO, or treat research IDs as Boundary enforcement.

---

## 6. Boundary follow-ups

| Item | Status |
|---|---|
| Process-local rate/concurrency | **Done** (R1–R7) |
| Encoded / malformed request reject | **Done** (NEXT-002) |
| Deny timing side_channel | Deferred (NEXT-001) |
| CI on release commit | Open (ops) |
| Independent review + custody drills | Open (ops) |

---

## 7. References

| Resource | Location |
|---|---|
| Freeze repository | https://github.com/holeyfield33-art/software-research-studio-freeze-2026-10-31 |
| NEXT-001 | [BOUNDARY-NEXT-001.md](BOUNDARY-NEXT-001.md) |
| NEXT-002 | [BOUNDARY-NEXT-002.md](BOUNDARY-NEXT-002.md) |
| SDLC | [SDLC.md](SDLC.md) |
| Gap map | [REDTEAM-GAP-MAP.md](REDTEAM-GAP-MAP.md) |

---

*Document version: 2026-11-01 (NEXT-002). Production remains NO-GO. Studio selector and Studio integration remain NO-GO.*
