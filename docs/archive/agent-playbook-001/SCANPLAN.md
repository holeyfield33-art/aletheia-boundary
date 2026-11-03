# Agent B ScanPlan

ScanPlan is an experimental, offline threat-to-test planning utility. It turns
structured security hypotheses into deterministic proposed fixture tests. It is
not a vulnerability scanner, does not inspect a target, and does not execute
the proposed tests.

## Scope and safeguards

- Supports `path_traversal`, `prompt_injection`, `tool_authority`, and
  `secret_exposure` hypotheses.
- Requires fixture-only scope and rejects requests that allow network access.
- Includes positive and negative controls and an independent-oracle requirement
  for each planned case.
- Generated plans always retain `execution: NOT_RUN`,
  `execution_authority: UNVERIFIED`, and `release_disposition: HOLD`.
- The reviewer identity is declared input, not verified authorization.

ScanPlan is separate from Aletheia Boundary; it is not part of the Boundary
runtime or a release gate. Do not treat a generated plan as evidence that a
test ran, a vulnerability exists, or permission was granted.

## Standalone project

The standalone source archive was extracted to
`Downloads/scanplan-upload/agent_b_scanplan` for local verification. Its source
code is not copied into this repository. See the standalone project's
`README.md`, `docs/PRODUCT.md`, `docs/SDLC.md`, and `docs/STATUS.md` for its
full contract and status.

Run it from the standalone project root with Python 3.11+:

```powershell
python -m scanplan plan examples/demo.json
python -m unittest discover -s tests -v
```

In the current Windows environment, the test suite reported **22 passed and
one error**: creating a symlink failed with `WinError 1314` because the runner
lacks the required privilege. This is an environment-blocked test, not a
passing symlink check. Re-run it in an environment that permits symlink
creation before claiming the full suite passes.
