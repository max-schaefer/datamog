/**
 * Compile-time exhaustiveness check. The argument's static type narrows to
 * `never` once every variant of a discriminated union has been handled, so a
 * new variant added later fails to typecheck at the call site. The runtime
 * `throw` is defence in depth for callers that hand us an `unknown`-typed
 * value at a deserialisation boundary.
 */
export function assertNever(value: never, context = "variant"): never {
  const tag = (value as { $type?: unknown } | null)?.$type;
  throw new Error(`Unexpected ${context}${tag === undefined ? "" : ` '${String(tag)}'`}`);
}
