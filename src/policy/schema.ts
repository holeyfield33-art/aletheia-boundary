/**
 * Strict policy schema (zod).
 *
 * The schema must reject anything the engine does not enforce.
 * Unknown effect (e.g. "denny") or unimplemented constraint (e.g. "aggregate")
 * fails closed at load time — never at request time with a silent allow.
 *
 * Array fields use .max() so oversized input fails fast (GHSA-mrhx-c7xc-m3w5).
 */

import { z } from "zod";

/** Only constraint types the minimizer actually implements. */
export const IMPLEMENTED_CONSTRAINT_TYPES = [
  "columns",
  "redact",
  "limit",
  "sample",
] as const;

const StringList = z.array(z.string()).max(64);

export const ConstraintSchema = z.object({
  type: z.enum(IMPLEMENTED_CONSTRAINT_TYPES),
  value: z.unknown(),
});

export const DecisionOutcomeSchema = z.enum([
  "allow",
  "deny",
  "allow_with_constraints",
]);

export const PolicyRuleSchema = z
  .object({
    id: z.string().min(1).max(128),
    match: z.object({
      action: z.union([z.string().max(64), StringList]).optional(),
      resource: z.union([z.string().max(256), StringList]).optional(),
      caller: z.union([z.string().max(256), StringList]).optional(),
      purpose: z.union([z.string().max(512), StringList]).optional(),
    }),
    effect: DecisionOutcomeSchema,
    constraints: z.array(ConstraintSchema).max(32).optional(),
    reason: z.string().max(1024).optional(),
    priority: z.number().optional(),
  })
  .superRefine((rule, ctx) => {
    if (
      rule.effect === "allow_with_constraints" &&
      (!rule.constraints || rule.constraints.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `rule "${rule.id}": effect allow_with_constraints requires a non-empty constraints array`,
      });
    }
  });

export const PolicyDocumentSchema = z.object({
  version: z.string().min(1).max(32),
  defaultEffect: z.enum(["deny", "allow"]).default("deny"),
  rules: z.array(PolicyRuleSchema).max(256),
});

export type ParsedPolicyDocument = z.infer<typeof PolicyDocumentSchema>;
