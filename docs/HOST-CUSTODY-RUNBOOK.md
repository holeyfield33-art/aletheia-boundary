# Local host isolation and checkpoint custody rehearsal

**Scope:** disposable synthetic Postgres only; production remains **NO-GO**. Run as
the host operator. An agent with this operator's shell or Docker permissions is
outside the restricted-agent profile. This runbook does not certify that desktop
session as isolated.

## Start and record

From the repository root, with Docker running and dependencies already installed:

```powershell
.\scripts\host-drill\prepare.ps1 -StagePath "$PWD\..\boundary-drill-stage-NEW"
node scripts/host-drill/run.mjs docs/evidence/HOST-CUSTODY-NEW
```

Choose new paths on every run. Pin HEAD, image ID, policy hash and the raw command
results in the evidence directory. Preparation builds `dist` and copies only
package metadata, compiled code and policies into the image; no existing keys or
logs enter the build context. The harness creates a separate internal network,
unpublished fixture DB and uniquely named Linux volumes. Existing desktop MCP,
database, keys and history remain in place. Native connectivity checks may append
normal receipts to the configured desktop log.

## Identities, paths and permitted tools

| Role | Authority |
|---|---|
| Operator | Docker administration; starts/stops exactly one writer for a log; reviews and publishes checkpoints |
| Writer UID 10001 | `/state` 0700; `/state/key.ed25519` and `/state/receipts.jsonl` 0600; read-only `/custody` mount; read-only database role; trusted caller `host-drill-reader` |
| Restricted agent UID 10002 | No DB network, state/custody mounts, DB credentials or Docker socket; the intended data tool allowlist is only `boundary_request` |

The harness's MCP client is operator-side. The restricted-agent container is a
negative-access probe, not an installed end-to-end model runtime. A real agent
host still needs a broker that exposes only the MCP stream and withholds shell,
Docker, credentials and direct network access. Inventory *all* tools, scripts,
GUIs and permissions for that host; an MCP configuration inventory alone is not
proof. Do not attach a SQL MCP, DB GUI, host shell or Docker tool to that agent.

## Single writer and custody

1. Operator reserves one service/container name and one state volume. Never
   start another name against that volume. Docker name reservation prevents the
   identical service name, **not** all possible writers. The drill demonstrates
   the different-name gap and stale-writer refusal; concurrent races remain
   untested. Actual enforcement needs exclusive supervision and restricted
   Docker/volume administration; fail closed if exclusivity is uncertain.
2. Stop and close the MCP writer before taking the approval snapshot. Run the
   offline verifier on the full log with its pinned public key and last approved
   checkpoint. Export to a **new** candidate path; never overwrite an anchor.
3. Human compares receipt count, content hash, full public-key fingerprint and
   independently retained prior anchor. Record approver, approval time and
   candidate file SHA-256. Harness `test-anchor.json` is **rehearsal-only** and
   has no implied human approval.
4. A separate custodian publishes immutable versioned checkpoints, retains
   earlier versions, and supplies the selected anchor read-only to the writer.
   Same-Docker-administrator volumes rehearse writer separation only; production
   custody must survive compromise of the writer host/administrator domain.
5. Freshness policy approved by the operator on 2026-11-01: anchor every
   completed batch and pause the next batch until approval/publication. An old
   checkpoint detects loss only through its receipt count; later unanchored
   suffix loss can remain invisible. Do not claim zero-loss recovery from it.

## Failure and teardown

Missing, malformed, wrong-key or ahead-of-log anchors must refuse production-mode
startup before serving tools. On mismatch, freeze evidence and stop service;
never shorten history, downgrade an anchor, rekey, or reset a log to make startup
pass. Restore an independently verified log/key/anchor set under operator review.
The harness alters **only throwaway volume copies** to rehearse these refusals.

The harness removes its fixture DB/container and network, retaining its two named
volumes for review. Their exact names are in `RESULTS.json`; remove only those
volumes after evidence review (they contain disposable private keys). Keep the
public candidate and raw outputs; do not commit private keys. Physical power-loss,
storage exhaustion, independent custody, release CI and independent review remain
separate obligations. No production settings or release approval are changed.
