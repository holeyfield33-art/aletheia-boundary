# Re-audit evidence — 2026-11-02

Raw results of the end-to-end re-audit of `main` at `0f59c4c` (package 0.0.11).
No repository code was changed by the audit. Files here are immutable; the
current queue built from these findings lives in [STATUS](../../STATUS.md).

| File | Content |
|---|---|
| [REPORT.md](REPORT.md) | Verdict, gates, findings N1–N9 and recommended fix order |
| `G1.txt`–`G5.txt`, `agent-review+G6.txt`, `scripts.txt` | Gate output from a fresh clone (G2 is empty because typecheck printed nothing and exited 0) |
| `reaudit-new.ts` | The nine new attacks behind N1–N9; expected to report `FAIL` on `0f59c4c` |
| `SHA256SUMS` | Hashes of the files above, taken when they were added |

The logs were captured as `.log` files and renamed to `.txt` when committed
because the repository ignores `*.log`. Contents are unchanged.

## Re-run the new attacks

The script imports `../src/...`, so run a copy from `audit/` and delete it
afterwards; it is evidence, not a gate. Each queue item's fix adds its own
permanent row to `audit/attacks.ts`.

```bash
cp docs/evidence/REAUDIT-2026-11-02/reaudit-new.ts audit/
export DATABASE_URL=postgres://readonly:readonly@localhost:5434/boundary
npx tsx audit/reaudit-new.ts
rm audit/reaudit-new.ts
```

Verify integrity: `cd docs/evidence/REAUDIT-2026-11-02 && sha256sum -c SHA256SUMS`.
