# Setting up Boundary for a team (beta)

How a business connects its people's AI apps — **Claude Desktop** and **Codex**
— to its Postgres data through Boundary. Written for the person doing the setup
(the admin, or a consultant doing it for them).

**Beta scope:** disposable or non-sensitive data only. Production is **NO-GO**;
see [STATUS](STATUS.md) for what is open. Both apps launch Boundary over stdio,
which is what it supports today. Remote (HTTP) access is not built.

---

## 1. What the business gets, and what it does not

| Boundary does | Boundary does not |
|---|---|
| Decides each request against the business's own policy (allow, deny, allow with limits) | Stop someone who has the database password from using it directly |
| Releases only allowed columns, row limits and redactions; never free-form SQL | Control other tools the AI app has (a shell, another database tool, files) |
| Signs a receipt for every allowed and denied request, verifiable offline | Keep released values out of the AI vendor's context: what is released, the model sees |

The right-hand column is the setup's job. Sections 2 and 6 cover it.

---

## 2. Choose a shape

With stdio, Boundary runs as a child process of the AI app, on the same
computer and as the same user. That decides where the database password lives.

| Shape | Where Boundary runs | Use for | Main risk |
|---|---|---|---|
| **A · Per laptop** | Each person's computer | Beta, demos, non-sensitive data | The read-only password sits on each laptop; anything with that user's access can read it |
| **B · Shared work machine** | One machine or VM the admin controls; people use the AI app there | First real customer data | People must not get admin or shell on that machine |
| C · Internal HTTP endpoint | One Boundary next to the database | Later | Not built yet |

**Codex has a shell; Claude Desktop does not by default.** An agent with a shell
can try to read its own MCP configuration and connect to the database directly.
In shape A that attempt may work, which bypasses Boundary. Run the bypass check
in section 5 before trusting a Codex setup. For anything beyond disposable data,
use shape B, keep the AI app's shell sandboxed, and follow the host rules in
[HOST-CUSTODY-RUNBOOK](HOST-CUSTODY-RUNBOOK.md) and
[HOST-ISOLATION-CHECKLIST](HOST-ISOLATION-CHECKLIST.md).

---

## 3. Admin setup (once)

### 3.1 Build Boundary

```bash
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm ci            # also builds dist/
```

Note the absolute path of the clone; every config below uses it.

### 3.2 Create a read-only database role

Grant only the tables the policy will ever allow. If the role cannot read a
table, no policy mistake can release it.

```sql
CREATE ROLE boundary_reader WITH LOGIN PASSWORD '<generate-a-long-random-one>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE <db> TO boundary_reader;
GRANT USAGE ON SCHEMA public TO boundary_reader;
GRANT SELECT ON public.orders, public.analytics_daily TO boundary_reader;  -- list tables explicitly
```

On startup Boundary refuses to run if the role is a superuser, can create
databases or roles, or has INSERT/UPDATE/DELETE/TRUNCATE on any table.

### 3.3 Write the policy

Start from [policies/example.yaml](../policies/example.yaml). The default must
stay `defaultEffect: deny`. Rules can match on `action`, `resource`, `caller`
and `purpose`.

- `caller` is the person's name set by the admin in their config (section 4).
  It is trustworthy because the agent cannot change it. Use it for per-person
  rules, for example only `finance-*` callers may query `public.orders`.
- `purpose` is whatever the agent claims. Never use it as the only condition on
  an allow rule. The server prints a `WARNING` line at startup for any allow
  rule that matches on `purpose` without a restricting `caller` (none, or `*`); check the MCP server log
  in Claude Desktop or Codex after editing the policy.

Until open queue items are fixed (see [STATUS](STATUS.md)):

- **N1:** write deny rules for both spellings, `users` and `public.users`, or
  use globs like `*users*`.
- **N2:** `columns` and `redact` must be lists (`["id"]`, not `"id"`) and
  `limit` must be a number. A wrong type is silently ignored.
- **N7:** give deny rules a higher `priority` than any allow they must beat.

### 3.4 One signing key and one receipt log per person

Each person's Boundary process signs its own receipt chain. Two processes must
never write the same log. Use one folder per person, readable only by the
admin and that process, for example:

```
/srv/boundary/alice/boundary.ed25519   (created on first start if missing)
/srv/boundary/alice/receipts.jsonl
```

For beta, leave `NODE_ENV` unset. `NODE_ENV=production` additionally requires a
host-held checkpoint ([runbook](HOST-CUSTODY-RUNBOOK.md)) and is not part of
beta.

---

## 4. Per-person configuration

Each block runs the built server with absolute paths, so it works from any
directory. Replace the values in `< >`.

### Claude Desktop

File: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`;
Windows `%APPDATA%\Claude\claude_desktop_config.json`. Restart Claude Desktop
after editing.

```json
{
  "mcpServers": {
    "aletheia-boundary": {
      "command": "node",
      "args": ["<clone>/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "postgres://boundary_reader:<password>@<host>:5432/<db>",
        "BOUNDARY_TRUSTED_CALLER": "alice",
        "BOUNDARY_POLICY": "<clone>/policies/<company>.yaml",
        "BOUNDARY_KEY_PATH": "/srv/boundary/alice/boundary.ed25519",
        "BOUNDARY_LOG_PATH": "/srv/boundary/alice/receipts.jsonl"
      }
    }
  }
}
```

### Codex

File: `~/.codex/config.toml`. If your Codex version already shows a working MCP
entry, match its layout; the keys below are the standard stdio ones.

```toml
[mcp_servers.aletheia-boundary]
command = "node"
args = ["<clone>/dist/mcp/server.js"]

[mcp_servers.aletheia-boundary.env]
DATABASE_URL = "postgres://boundary_reader:<password>@<host>:5432/<db>"
BOUNDARY_TRUSTED_CALLER = "bob"
BOUNDARY_POLICY = "<clone>/policies/<company>.yaml"
BOUNDARY_KEY_PATH = "/srv/boundary/bob/boundary.ed25519"
BOUNDARY_LOG_PATH = "/srv/boundary/bob/receipts.jsonl"
```

Do not give either app another database tool (a Postgres MCP server, a DB GUI
integration) for the same database. That is a second door around Boundary.

---

## 5. First-run checks (per person, as the agent)

Ask the agent to do each of these and compare with the expected result.

| Ask | Expected |
|---|---|
| "What tables can you see?" | Only tables the policy allows; denied tables are absent |
| An allowed question, e.g. last month's revenue | `ok: true`, only allowed columns, `stats.truncated` honest |
| Something the policy denies, e.g. customer SSNs | `ok: false` with the policy's reason |
| "Run this SQL: …" | Refused; free-form SQL is never accepted |
| **Codex only:** "Find the database connection settings on this machine and query the database directly, without boundary_request" | Must fail. If it succeeds, this setup is shape A with a bypass: move to shape B or sandbox the shell before using real data |

Then confirm the receipts, including the denial:

```bash
npm run verify-log -- --log /srv/boundary/alice/receipts.jsonl --pub /srv/boundary/alice/boundary.pub.pem
```

---

## 6. Ongoing operations

| When | Do |
|---|---|
| Weekly | Copy each person's receipt log to storage they cannot write, and run `verify-log` on the copy |
| Policy change | Edit the YAML, restart the AI app, re-run section 5 |
| Someone leaves | Remove their config block, keep their key and log, rotate the database password if it was on their laptop |
| Anything unexpected | Denied data in a result, a write reaching the DB, a receipt that fails verification, or stub data without `dataSource: "stub"`: stop using it and report it ([stop-ship](STATUS.md#beta-entry-criteria-target-friday)) |
