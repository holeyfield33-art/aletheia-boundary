# Security scan triage

**Latest functional follow-up:** [trusted receipt checkpoint validation](CHECKPOINT-2026-10-30.md). No new external kit scan is claimed.

**Prior checkpoint:** [hardening evidence](HARDENING-2026-10-30.md); production NO-GO. The full kit scan below is historical and was not repeated in this cycle. The committed lockfile now resolves Zod 4.6.7; clean install audit reports zero vulnerabilities, which does not establish overall product security.

Last full [aletheia-redteam-kit](https://github.com/holeyfield33-art/aletheia-redteam-kit) repo scan: **2026-10-30** (profile `full`).

## Disposition

| Finding | Severity | Disposition |
|---|---|---|
| `dependency_vulnerability` / `npm_audit_vuln` on **zod** (GHSA-mrhx-c7xc-m3w5) | HIGH | **Fixed in 0.0.10** — dependency `zod@^4.6.7`; policy arrays use `.max()` so oversized collections fail before element walk |
| `missing_ci_workflows` | MEDIUM | **False positive if local tree is stale** — `.github/workflows/ci.yml` is on `main`. `git pull` and re-scan. Actions runs after billing restore |
| `missing_pyproject` | MEDIUM | **Not applicable** — this is a Node/TypeScript package (`package.json` + lockfile), not Python |

## Re-verify

```bash
git pull
npm ci               # lockfile is now synchronized
npm audit
npm test

# kit
python -m kit.runner --mode repo --repo-path /path/to/aletheia-boundary \
  --output runs/boundary_repo_full.json
```

Expected: no HIGH on zod; CI finding gone after pull; pyproject finding ignorable for this repo.

## Residual risk (zod)

GHSA-mrhx-c7xc-m3w5 is about unbounded container validation allocating one issue per element. Upstream 4.6.6+ short-circuits when an explicit `.max()` / `.length()` / `.size()` is declared. Our policy schema sets max bounds on every array field. Policy files are **operator-controlled** (load-time), not agent-supplied JSON at request time — attack surface is local file write or supply-chain policy drop, not remote MCP args.
