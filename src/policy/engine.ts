import type {
  BoundaryRequest,
  Decision,
  PolicyDocument,
  PolicyRule,
} from "../types.js";

/**
 * Minimal policy engine.
 *
 * v0: ordered rules by priority (desc), first match wins.
 * Default is fail-closed (deny) unless the document says otherwise.
 */
export class PolicyEngine {
  constructor(private readonly doc: PolicyDocument) {}

  evaluate(req: BoundaryRequest): Decision {
    const now = new Date().toISOString();
    const rules = [...this.doc.rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
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

    // No match → default effect (fail-closed recommended)
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

  private valueMatches(
    matcher: string | string[],
    actual: string
  ): boolean {
    const candidates = Array.isArray(matcher) ? matcher : [matcher];
    return candidates.some((c) => {
      if (c === "*") return true;
      // Simple prefix / exact for v0; glob later
      if (c.endsWith("*")) {
        return actual.startsWith(c.slice(0, -1));
      }
      return c === actual;
    });
  }
}

export function loadPolicyFromObject(obj: unknown): PolicyDocument {
  // Lightweight validation; replace with zod later if desired
  const doc = obj as PolicyDocument;
  if (!doc.version || !Array.isArray(doc.rules)) {
    throw new Error("Invalid policy document: missing version or rules");
  }
  if (doc.defaultEffect !== "allow" && doc.defaultEffect !== "deny") {
    doc.defaultEffect = "deny";
  }
  return doc;
}
