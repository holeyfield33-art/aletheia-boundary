import type { BoundaryRequest, Constraint, MinimizedPayload } from "../types.js";

/**
 * Data provider interface.
 *
 * Real Postgres implementation will reuse the hardened read-only path
 * from aletheia-sandbox. For now we ship a deterministic stub so the
 * decision + receipt path can be exercised end-to-end.
 */
export interface DataProvider {
  execute(
    req: BoundaryRequest,
    constraints?: Constraint[]
  ): Promise<MinimizedPayload>;
}

export class StubProvider implements DataProvider {
  async execute(
    req: BoundaryRequest,
    constraints?: Constraint[]
  ): Promise<MinimizedPayload> {
    const transforms: string[] = [];

    if (constraints) {
      for (const c of constraints) {
        transforms.push(`${c.type}:${JSON.stringify(c.value)}`);
      }
    }

    // Deterministic fake payload for development
    const data = {
      resource: req.resource,
      action: req.action,
      note: "StubProvider — replace with real Postgres / file provider",
      sample: [
        { id: 1, name: "redacted", value: 42 },
        { id: 2, name: "redacted", value: 17 },
      ],
    };

    if (constraints?.some((c) => c.type === "columns")) {
      transforms.push("columns-projected");
    }
    if (constraints?.some((c) => c.type === "redact")) {
      transforms.push("identifiers-stripped");
    }

    return {
      data,
      transforms: transforms.length ? transforms : ["none"],
      stats: { rows: 2, bytes: JSON.stringify(data).length, truncated: false },
    };
  }
}
