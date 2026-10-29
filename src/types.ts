/**
 * Core types for Aletheia Boundary.
 *
 * Everything flows through these shapes. Keep them small and explicit.
 */

export type DecisionOutcome = "allow" | "deny" | "allow_with_constraints";

export interface BoundaryRequest {
  /** Stable request id (client-supplied or generated). */
  id: string;
  /** What the agent is asking for. */
  action: "query" | "schema" | "export" | "sample";
  /** Target resource (table, file path, collection, etc.). */
  resource: string;
  /** Optional SQL / filter / parameters. */
  params?: Record<string, unknown>;
  /** Claimed purpose / context from the agent or orchestrator. */
  purpose?: string;
  /** Caller identity or session tag (for policy matching). */
  caller?: string;
  /** ISO timestamp when the request entered the boundary. */
  receivedAt: string;
}

/**
 * Only constraint types the minimizer implements.
 * Unimplemented types (aggregate, rows, …) are rejected at policy load time.
 */
export interface Constraint {
  type: "columns" | "redact" | "limit" | "sample";
  value: unknown;
}

export interface Decision {
  outcome: DecisionOutcome;
  /** Human-readable reason for audit. */
  reason: string;
  /** Constraints applied when outcome is allow_with_constraints. */
  constraints?: Constraint[];
  /** Policy rule id that matched (if any). */
  ruleId?: string;
  /** When the decision was made. */
  decidedAt: string;
}

export interface MinimizedPayload {
  /** The actual data released to the agent. */
  data: unknown;
  /** What transformations were applied. */
  transforms: string[];
  /** Row / byte counts for the log. */
  stats?: {
    rows?: number;
    bytes?: number;
    truncated?: boolean;
  };
}

export interface Receipt {
  /** Unique receipt id. */
  id: string;
  /** Hash of the previous receipt (hash chain). */
  prevHash: string | null;
  /** SHA-256 of the canonical request + decision + payload summary. */
  contentHash: string;
  /** Ed25519 signature over contentHash (or full body). */
  signature: string;
  /** Public key fingerprint or key id used to sign. */
  keyId: string;
  request: BoundaryRequest;
  decision: Decision;
  /** Summary only — never the full raw data. */
  payloadSummary: {
    transforms: string[];
    stats?: MinimizedPayload["stats"];
  };
  createdAt: string;
}

export interface PolicyRule {
  id: string;
  /** Simple matchers for v0. Later: richer language. */
  match: {
    action?: string | string[];
    resource?: string | string[];
    caller?: string | string[];
    purpose?: string | string[];
  };
  effect: DecisionOutcome;
  constraints?: Constraint[];
  reason?: string;
  priority?: number;
}

export interface PolicyDocument {
  version: string;
  defaultEffect: "deny" | "allow";
  rules: PolicyRule[];
}

export interface BoundaryResult {
  ok: boolean;
  decision: Decision;
  payload?: MinimizedPayload;
  receipt: Receipt;
  error?: string;
}
