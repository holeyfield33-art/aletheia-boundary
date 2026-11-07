/**
 * Canonical resource keys (N1).
 *
 * The policy engine and the Postgres provider must agree on which table a
 * resource names. A bare name resolves to the `public` schema, matching how
 * the provider reads it, so `users` and `public.users` are the same key.
 */

const DEFAULT_SCHEMA = "public";

/** Canonical `schema.table` for a requested resource; `*` is left as-is. */
export function canonicalResource(resource: string): string {
  if (resource === "*" || resource.includes(".")) return resource;
  return `${DEFAULT_SCHEMA}.${resource}`;
}

/**
 * Canonical form of a policy resource pattern. A dotless pattern names a
 * table in the default schema (`users`, `user*`), like a bare request.
 * Patterns that start with `*` are unanchored and match any schema.
 */
export function canonicalResourcePattern(pattern: string): string {
  if (pattern.startsWith("*") || pattern.includes(".")) return pattern;
  return `${DEFAULT_SCHEMA}.${pattern}`;
}
