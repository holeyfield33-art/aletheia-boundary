/**
 * Strict policy schema (zod).
 *
 * The schema must reject anything the engine does not enforce.
 * Unknown effect (e.g. "denny") or unimplemented constraint (e.g. "aggregate")
 * fails closed at load time — never at request time with a silent allow.
 */

import { z } from "zod";

/** Only constraint types the minimizer actually implements. */
export const IMPLEMENTED_CONSTRAINT_TYPES = [
  "columns",
  "redact",
  "limit",
  "sample",
] as const;

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
    id: z.string().min(1),
    match: z.object({
      action: z.union([z.string(), z.array(z.string())]).optional(),
      resource: z.union([z.string(), z.array(z.string())]).optional(),
      caller: z.union([z.string(), z.array(z.string())]).optional(),
      purpose: z.union([z.string(), z.array(z.string())]).optional(),
    }),
    effect: DecisionOutcomeSchema,
    constraints: z.array(ConstraintSchema).optional(),
    reason: z.string().optional(),
    priority: z.number().optional(),
  })
  .superRefine((rule, ctx) => {
    if (
      rule.effect === "allow_with_constraints" &&
      (!rule.constraints || rule.constraints.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rule "${rule.id}": effect allow_with_constraints requires a non-empty constraints array`,
      });
    }
  });

export const PolicyDocumentSchema = z.object({
  version: z.string().min(1),
  defaultEffect: z.enum(["deny", "allow"]).default("deny"),
  rules: z.array(PolicyRuleSchema),
});

export type ParsedPolicyDocument = z.infer<typeof PolicyDocumentSchema>;
