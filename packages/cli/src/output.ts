// Output-formatting helpers for the CLI. Kept in a separate module so the
// non-trivial cases (BigInt serialisation in particular) can be unit-tested
// without going through the whole executor pipeline.

// `bigintSafeReplacer` lives in `datamog-engine/json-canonical` so the
// Mermaid output (`engine/mermaid-output.ts`) and the playground's
// `formatCell` (`playground/lib/format-cell.ts`) can share a single
// implementation. Re-export from here so existing imports keep working
// and the CLI test stays pinned to a stable surface.
export { bigintSafeReplacer } from "datamog-engine";
import { bigintSafeReplacer } from "datamog-engine";

/**
 * Convert a result-row cell into the string form the CSV / table
 * outputs expect. JSON-typed columns arrive as parsed JS values
 * (objects / arrays / primitives), so a bare `String(v)` would
 * render them as `"[object Object]"` — useless in CSV. Stringify
 * compounds as canonical JSON instead so downstream consumers can
 * round-trip the value through `JSON.parse`.
 */
export function formatCellAsString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, bigintSafeReplacer);
  return String(value);
}
