import { randomUUID } from "node:crypto";
import type {
  BoundaryRequest,
  BoundaryResult,
  Decision,
} from "./types.js";
import { PolicyEngine } from "./policy/engine.js";
import { ReceiptLog } from "./receipt/log.js";
import type { DataProvider } from "./data/provider.js";

/**
 * The main boundary object.
 *
 * Agent request in → policy decision → (optional) data plane → receipt → response.
 * Fail closed on any error.
 */
export class Boundary {
  constructor(
    private readonly policy: PolicyEngine,
    private readonly provider: DataProvider,
    private readonly log: ReceiptLog
  ) {}

  async handle(partial: Omit<BoundaryRequest, "id" | "receivedAt"> & { id?: string }): Promise<BoundaryResult> {
    const request: BoundaryRequest = {
      id: partial.id ?? randomUUID(),
      action: partial.action,
      resource: partial.resource,
      params: partial.params,
      purpose: partial.purpose,
      caller: partial.caller,
      receivedAt: new Date().toISOString(),
    };

    let decision: Decision;

    try {
      decision = this.policy.evaluate(request);
    } catch (err) {
      // Policy engine itself must not throw in production, but guard anyway
      decision = {
        outcome: "deny",
        reason: `Policy evaluation failed: ${String(err)}`,
        decidedAt: new Date().toISOString(),
      };
      const receipt = this.log.create(request, decision);
      return { ok: false, decision, receipt, error: decision.reason };
    }

    if (decision.outcome === "deny") {
      const receipt = this.log.create(request, decision);
      return { ok: false, decision, receipt };
    }

    // allow or allow_with_constraints
    try {
      const payload = await this.provider.execute(
        request,
        decision.constraints
      );
      const receipt = this.log.create(request, decision, payload);
      return { ok: true, decision, payload, receipt };
    } catch (err) {
      // Data plane failure → deny + log the failure
      const failDecision: Decision = {
        outcome: "deny",
        reason: `Data plane error: ${String(err)}`,
        decidedAt: new Date().toISOString(),
        ruleId: decision.ruleId,
      };
      const receipt = this.log.create(request, failDecision);
      return {
        ok: false,
        decision: failDecision,
        receipt,
        error: failDecision.reason,
      };
    }
  }
}
