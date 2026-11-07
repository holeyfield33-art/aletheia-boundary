import type {
  BoundaryRequest,
  Decision,
  PolicyDocument,
  PolicyRule,
} from "../types.js";
import { PolicyDocumentSchema } from "./schema.js";
import { canonicalResource, canonicalResourcePattern } from "./resource.js";

/**
 * Minimal policy engine.
 *
 * v0: ordered rules by priority (desc), first match wins; ties go to the
 * most restrictive effect (N7).
 * Default is fail-closed (deny) unless the document says otherwise.
 * Effects and constraints are validated at load time (see schema.ts).
 */
/** Lower rank wins an equal-priority tie (fail closed). */
const EFFECT_RANK: Record<PolicyRule["effect"], number> = {
  deny: 0,
  allow_with_constraints: 1,
  allow: 2,
};

export class PolicyEngine {
  constructor(private readonly doc: PolicyDocument) {}

  evaluate(req: BoundaryRequest): Decision {
    const now = new Date().toISOString();
    // Highest priority first; on a tie the most restrictive effect wins
    // (N7: deny, then allow_with_constraints, then allow), never document order.
    const rules = [...this.doc.rules].sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        EFFECT_RANK[a.effect] - EFFECT_RANK[b.effect],
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
    if (m.resource && !this.resourceMatches(rule, req.resource)) return false;
    if (m.caller && !this.valueMatches(m.caller, req.caller ?? "")) return false;
    if (m.purpose && !this.valueMatches(m.purpose, req.purpose ?? "")) return false;

    return true;
  }

  /**
   * N1: compare canonical schema.table keys so the rule binds to the table
   * the provider actually reads. Postgres names are case-sensitive when
   * quoted, so case handling fails closed: deny rules ignore case (match
   * more), allow rules match case exactly (never reach a case-only twin).
   */
  private resourceMatches(rule: PolicyRule, resource: string): boolean {
    const raw = rule.match.resource ?? [];
    const patterns = (Array.isArray(raw) ? raw : [raw]).map(
      canonicalResourcePattern,
    );
    const actual = canonicalResource(resource);
    const flags = rule.effect === "deny" ? "i" : "";
    return patterns.some((c) => {
      if (c === "*") return true;
      const escaped = c
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`, flags).test(actual);
    });
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
