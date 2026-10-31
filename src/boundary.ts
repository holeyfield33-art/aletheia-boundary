import { randomUUID } from "node:crypto";
import type {
  BoundaryRequest,
  BoundaryResult,
  Decision,
  MinimizedPayload,
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
    private readonly log: ReceiptLog,
  ) {}

  async handle(
    partial: Omit<BoundaryRequest, "id" | "receivedAt"> & { id?: string },
  ): Promise<BoundaryResult> {
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
    } catch {
      decision = {
        outcome: "deny",
        reason: "Policy evaluation failed",
        decidedAt: new Date().toISOString(),
      };
      const receipt = this.log.create(request, decision);
      return { ok: false, decision, receipt, error: decision.reason };
    }

    if (decision.outcome === "deny") {
      const receipt = this.log.create(request, decision);
      return { ok: false, decision, receipt };
    }

    let payload: MinimizedPayload;
    try {
      payload = await this.provider.execute(request, decision.constraints);

      // F10: do not advertise tables the policy would deny for access.
      if (request.action === "schema") {
        payload = this.filterSchemaPayload(payload, request, decision);
      }
    } catch {
      const failDecision: Decision = {
        outcome: "deny",
        reason: "Data request failed; input not allowed or provider unavailable",
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
    const receipt = this.log.create(request, decision, payload);
    return { ok: true, decision, payload, receipt };
  }

  /**
   * Drop schema entries for relations that are not reachable under policy.
   * Omit when:
   *   - schema on that table is denied, or
   *   - both sample and query are denied (no data path).
   * Prevents column-name reconnaissance of PII tables (F10).
   */
  private filterSchemaPayload(
    payload: MinimizedPayload,
    request: BoundaryRequest,
    initialDecision: Decision,
  ): MinimizedPayload {
    if (!Array.isArray(payload.data)) return payload;

    const tables = payload.data as {
      schema: string;
      name: string;
      columns: unknown[];
    }[];

    const allowed = tables.flatMap((t) => {
      const key = `${t.schema}.${t.name}`;
      const base = {
        id: request.id,
        purpose: request.purpose,
        caller: request.caller,
        receivedAt: request.receivedAt,
      };

      const schemaD = this.policy.evaluate({
        ...base,
        action: "schema",
        resource: key,
      });
      if (schemaD.outcome === "deny") return [];

      const sampleD = this.policy.evaluate({
        ...base,
        action: "sample",
        resource: key,
      });
      const queryD = this.policy.evaluate({
        ...base,
        action: "query",
        resource: key,
      });
      if (sampleD.outcome === "deny" && queryD.outcome === "deny") return [];

      // Conservative metadata intersection across schema and reachable reads.
      const paths = [initialDecision, schemaD, ...[sampleD, queryD].filter(d => d.outcome !== "deny")];
      const columns = t.columns.filter(column => {
        if (!column || typeof column !== "object" || !("name" in column)) return false;
        const name = (column as { name: string }).name;
        return paths.every(d => (d.constraints ?? []).every(c => {
          if (c.type === "columns") return Array.isArray(c.value) && c.value.includes(name);
          if (c.type === "redact") return Array.isArray(c.value) && !c.value.includes(name);
          return true;
        }));
      });
      return [{ schema: t.schema, name: t.name, columns }];
    });

    const transforms = [
      ...payload.transforms,
      "schema-columns-projected",
      "schema-filtered",
    ];

    return {
      ...payload,
      data: allowed,
      transforms,
      stats: {
        ...payload.stats,
        rows: allowed.length,
        bytes: Buffer.byteLength(JSON.stringify(allowed)),
      },
    };
  }
}
