// Cross-backend canonicalisation for JSON values.
//
// Postgres `jsonb` is the only backend with native structural equality
// — it canonicalises numbers (`1.0` → `1`) and sorts object keys on
// storage. SQLite and sql.js store JSON as TEXT and compare textually
// under `=`, `DISTINCT`, and `UNION`. Without canonicalisation,
// `{"a":1,"b":2}` and `{"b":2,"a":1}` would not join, dedupe, or unify
// across rules — silently breaking joins and aggregates.
//
// The strategy is: canonicalise *once* on insert (in `loader.ts`'s
// `insertRows`), trust the canonical form to be preserved through
// `json_extract` / `json_each` / `json_group_array` (verified on
// SQLite and sql.js), so sub-values produced by Subscript / Slice /
// object_entry / array_element inherit canonical key order without
// further wrapping.
//
// Number normalisation rides on JS `Number` precision (IEEE doubles),
// matching the rest of Datamog. Integer JSON values above 2^53 lose
// precision through this pipeline — a documented limitation, identical
// to what already applies to `integer`-typed columns.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * True if `value` is a JSON value Datamog can represent without IEEE
 * non-finite numbers. `JSON.parse` can produce `Infinity` for syntactically
 * valid numbers such as `9e999`; those are not valid runtime values here.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const t = typeof value;
  if (t === "boolean" || t === "string") return true;
  if (t === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (t === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

/**
 * `JSON.stringify` replacer that survives BigInt values.
 *
 * Some backends — notably Postgres via `Bun.sql`, which preserves
 * BIGINT columns as JS `BigInt` to avoid silent precision loss for
 * values outside the ±2^53 safe-integer window — return BigInt cells.
 * Bare `JSON.stringify` throws on a BigInt
 * (`JSON.stringify cannot serialize BigInt`), so any display path
 * that renders compound cells as JSON must route through this
 * replacer. Used by the CLI's CSV / JSONL output, the Mermaid
 * formatter, and the playground's `formatCell`.
 *
 * Convert safe-range BigInts back to `Number` (they round-trip
 * exactly) and fall back to a JSON string for out-of-range values
 * so the user sees a useful representation either way instead of
 * the program aborting.
 */
export function bigintSafeReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
    return value.toString();
  }
  return value;
}

/**
 * Compare object keys in PostgreSQL jsonb's canonical order: UTF-8 byte length
 * first, then byte value. Datamog adopts this for every canonical-TEXT backend
 * because Postgres recursively applies it on storage and cannot cheaply be
 * made to emit a different recursive key order from scalar SQL expressions.
 */
const utf8Encoder = new TextEncoder();

export function compareJsonbObjectKeys(a: string, b: string): number {
  const ab = utf8Encoder.encode(a);
  const bb = utf8Encoder.encode(b);
  if (ab.length !== bb.length) return ab.length < bb.length ? -1 : 1;
  for (let i = 0; i < ab.length; i++) {
    const av = ab[i]!;
    const bv = bb[i]!;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/**
 * Stringify `value` as canonical JSON: object keys sorted in jsonb-canonical
 * order at every depth, numbers normalised by `JSON.stringify` (so `1.0`
 * becomes `1`, `1e10` becomes `10000000000`, etc.). The output is parseable
 * as JSON and structurally equivalent to the input.
 */
export function canonicalizeJson(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const keys = Object.keys(value).sort(compareJsonbObjectKeys);
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(value[k] as JsonValue)}`);
  return `{${parts.join(",")}}`;
}
