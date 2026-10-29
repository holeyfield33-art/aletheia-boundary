# Aletheia Boundary

**Local, independent data-boundary enforcer for AI agents.**

The cloud model never touches your data. It asks this program.

Aletheia Boundary runs on the customer's machine (or in their VPC) next to the data. It decides what the agent may see, releases only the minimal cleaned projection, and writes a tamper-evident log that the customer owns and the AI vendor cannot edit.

> A visual rule alone cannot secure a system. Enforcement at the data boundary is the product; everything else is decoration.

---

## Why this exists

OpenAI, Anthropic, or any other model provider cannot credibly be the thing that controls and audits their own model's access to your data. The enforcement point has to be local and independent of them.

This is the independent layer that sits between any agent (cloud or local) and the data it wants to touch.

### The three jobs

1. **Decide**  
   Evaluate every request (read this table, export that file, run this query) against local policy. Allow, deny, or allow-with-constraints.

2. **Keep the data in**  
   Raw data stays local. Only what policy permits leaves the boundary — after column filtering, row filtering, identifier stripping, aggregation, sampling, or redaction.

3. **Log what actually happened**  
   Every decision and every release is recorded in a hash-chained, signed, customer-owned log. The vendor cannot rewrite history.

---

## Architecture

```
Cloud / local agent
        |
        |  MCP / HTTP / stdio tool call
        v
+-------------------------------------+
|        Aletheia Boundary            |
|  (runs next to the data)            |
|                                     |
|  1. Policy engine                   |
|     - local rules                   |
|     - purpose / context claims      |
|     - allow / deny / constrain      |
|                                     |
|  2. Data plane                      |
|     - sandboxed execution           |
|     - minimizer / projector         |
|     - providers (Postgres first)    |
|                                     |
|  3. Receipt + log writer            |
|     - hash chain                    |
|     - Ed25519 signature             |
|     - customer-owned key            |
+-------------------------------------+
        |
        |  cleaned payload + receipt
        v
      Agent receives only what was allowed
```

Fail-closed by default. Policy miss, log failure, or provider error → deny.

---

## Relationship to existing work

| Component              | Role in this product                                      |
|------------------------|-----------------------------------------------------------|
| `aletheia-sandbox`     | Hardened V8 isolate + read-only Postgres provider + receipts |
| Aegis provenance       | Signed spans, egress checks, trust lattice patterns       |
| Aletheia Core          | Runtime policy / intent validation patterns               |

Boundary is the **data-plane enforcement point**. Sandbox becomes a provider behind it. Aegis-style receipts become the log format. Core-style policy thinking informs the decision engine.

This repository is intentionally separate so the boundary can be deployed, versioned, and audited independently of any single agent or model vendor.

---

## Status

**Pre-0.1 scaffold.** Interfaces and MCP skeleton are in place. Real policy engine, minimizer, and Postgres provider integration are next.

### MVP targets

- [x] Repository + architecture documentation
- [ ] Core TypeScript interfaces (`Policy`, `Decision`, `Request`, `Receipt`)
- [ ] Minimal MCP server exposing `boundary_request`
- [ ] Declarative YAML/JSON policy (allow/deny + simple transforms)
- [ ] Postgres provider (reuse hardened path from aletheia-sandbox)
- [ ] Hash-chained, Ed25519-signed receipt log
- [ ] Fail-closed path + basic integration test

---

## Quick start (once implemented)

```bash
# Clone and install
git clone https://github.com/holeyfield33-art/aletheia-boundary.git
cd aletheia-boundary
npm install

# Point at a read-only data source and a policy file
export DATABASE_URL="postgres://readonly:..."
export BOUNDARY_POLICY="./policies/example.yaml"
export BOUNDARY_KEY_PATH="./keys/boundary.ed25519"

# Run the MCP server
npx aletheia-boundary
```

Agent config example (Claude Desktop / Cursor style):

```json
{
  "mcpServers": {
    "aletheia-boundary": {
      "command": "npx",
      "args": ["aletheia-boundary"],
      "env": {
        "DATABASE_URL": "postgres://readonly:...",
        "BOUNDARY_POLICY": "./policies/example.yaml"
      }
    }
  }
}
```

The agent receives a single constrained tool. It never talks directly to the database.

---

## Design principles

1. **Customer owns the enforcement and the log.** Vendor cannot be judge of its own access.
2. **Fail closed.** Ambiguity or failure = deny.
3. **Minimize by default.** Release the smallest projection that satisfies the request under policy.
4. **Receipts are first-class.** Every decision is cryptographically attributable.
5. **Local first.** Works offline / air-gapped. Cloud is optional.
6. **One clear tool surface.** Prefer a small, well-specified MCP tool over a large API surface.

---

## License

Apache-2.0

---

Built by [Aletheia Sovereign Systems](https://github.com/holeyfield33-art) — the independent layer the platforms cannot be.
