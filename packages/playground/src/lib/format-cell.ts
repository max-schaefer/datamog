import { bigintSafeReplacer } from "datamog-engine";

/**
 * Render a result-row cell as a string suitable for the playground's
 * tables and step-debugger relation views. `value`-typed columns
 * arrive as parsed JS values (objects / arrays), so a bare
 * `String(v)` would collapse every distinct `value` to the literal
 * string
 * `"[object Object]"`. Stringify compounds as JSON instead so the
 * displayed cell carries the actual value.
 *
 * `bigintSafeReplacer` survives BigInt cells — Postgres BIGINT columns
 * arrive as JS `BigInt` via `Bun.sql`, and bare `JSON.stringify`
 * throws `cannot serialize BigInt` outright.
 *
 * Mirrors `formatCellAsString` in `packages/cli/src/output.ts` and
 * `cellToString` in `packages/engine/src/mermaid-output.ts` — every
 * surface that renders rows for a human goes through this shape now.
 */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, bigintSafeReplacer);
  return String(value);
}
