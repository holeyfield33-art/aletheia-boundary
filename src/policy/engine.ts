import type {
  BoundaryRequest,
  Decision,
  PolicyDocument,
  PolicyRule,
} from "../types.js";
import { PolicyDocumentSchema } from "./schema.js";

/**
 * Minimal policy engine.
 *
 * v0: ordered rules by priority (desc), first match wins.
 * Default is fail-closed (deny) unless the document says otherwise.
 * Effects and constraints are validated at load time (see schema.ts).
 */
export class PolicyEngine {
  constructor(private readonly doc: PolicyDocument) {}

  evaluate(req: BoundaryRequest): Decision {
    const now = new Date().toISOString();
    const rules = [...this.doc.rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    for (const rule of rules) {
      if (this.matches(rule, req)) {
        return {
          outcome: rule.effect,
          reason: rule.reason ?? `Matched rule ${rule.id}`,
          constraints: rule.constraints,
          ruleId: rule.id,
          decidedAt: now,
        };
      }
    }

    return {
      outcome: this.doc.defaultEffect === "allow" ? "allow" : "deny",
      reason: "No matching rule; applied defaultEffect",
      decidedAt: now,
    };
  }

  private matches(rule: PolicyRule, req: BoundaryRequest): boolean {
    const m = rule.match;

    if (m.action && !this.valueMatches(m.action, req.action)) return false;
    if (m.resource && !this.valueMatches(m.resource, req.resource)) return false;
    if (m.caller && !this.valueMatches(m.caller, req.caller ?? "")) return false;
    if (m.purpose && !this.valueMatches(m.purpose, req.purpose ?? "")) return false;

    return true;
  }

  /**
   * Glob-ish matching:
   *   *           → any
   *   prefix*     → starts with prefix
   *   *suffix     → ends with suffix
   *   *mid*       → contains mid
   *   exact       → equality
   */
  private valueMatches(matcher: string | string[], actual: string): boolean {
    const candidates = Array.isArray(matcher) ? matcher : [matcher];
    return candidates.some((c) => {
      if (c === "*") return true;
      if (c.includes("*")) {
        const escaped = c
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*");
        return new RegExp(`^${escaped}$`, "i").test(actual);
      }
      return c === actual;
    });
  }
}

/**
 * Parse and validate a policy document.
 * Throws on unknown effects, unimplemented constraints, or malformed docs.
 * Never coerces invalid values into allows.
 */
export function loadPolicyFromObject(obj: unknown): PolicyDocument {
  const parsed = PolicyDocumentSchema.safeParse(obj);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid policy document: ${details}`);
  }
  return parsed.data as PolicyDocument;
}
