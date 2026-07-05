// Buffer-free CSV row-builders shared between the Bun-side directory
// loader, the CLI's explicit-file loader, the gsheet public-CSV path,
// and the browser playground's in-memory loader. The actual `csv-parse`
// call lives at each call site so callers can pick between
// `csv-parse/sync` (Bun) and `csv-parse/browser/esm/sync` (browser); only
// the per-cell coercion / column-validation loop is shared, and that
// has no parser dependency.

import type { ExtDecl } from "datamog-core";
import { coerceColumnValue } from "datamog-engine";

export interface CsvRowBuildOptions {
  /** Used in error messages to identify the source. Defaults to `<predicate>.csv`. */
  source?: string;
}

/**
 * Build typed rows from positional CSV records (one string-array per row).
 * Each record carries its 1-based source `lineNum` so error messages
 * point at the *actual* source line (after `skip_empty_lines` etc.).
 */
export function csvRowsFromPositional(
  records: { fields: string[]; lineNum: number }[],
  decl: ExtDecl,
  options: CsvRowBuildOptions = {},
): Record<string, unknown>[] {
  const source = options.source ?? `${decl.predicate}.csv`;
  const rows: Record<string, unknown>[] = [];
  for (const { fields, lineNum } of records) {
    if (fields.length !== decl.columns.length) {
      throw new Error(
        `${source} line ${lineNum}: expected ${decl.columns.length} fields but got ${fields.length}`,
      );
    }
    const row: Record<string, unknown> = {};
    for (let j = 0; j < decl.columns.length; j++) {
      const col = decl.columns[j]!;
      row[col.name] = coerceColumnValue(
        fields[j]!,
        col,
        `${source} line ${lineNum}, column '${col.name}'`,
      );
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Build typed rows from header-keyed CSV records (one object per row,
 * keyed by header column name). Used by sources that prefer to thread
 * column resolution through the parser (`columns: true`) — the gsheet
 * public-CSV path and the browser playground.
 *
 * Validates that every declared column appears in the first record's
 * keys before building rows, so a header typo surfaces as
 * "missing field 'X'" instead of a confusing per-cell coercion error.
 * `lineNumOf` maps a 0-based record index to a 1-based source line
 * number; the default `i + 2` accounts for the header line that
 * `columns: true` consumes (record 0 is source line 2). Callers that
 * track real source lines (e.g. the file-on-disk csv loader) should
 * pass an explicit mapping so `skip_empty_lines` / blank rows don't
 * skew the count.
 */
export function csvRowsFromKeyed(
  records: Record<string, string>[],
  decl: ExtDecl,
  options: CsvRowBuildOptions & { lineNumOf?: (recordIdx: number) => number } = {},
): Record<string, unknown>[] {
  const source = options.source ?? `${decl.predicate}.csv`;
  const lineNumOf = options.lineNumOf ?? ((i: number) => i + 2);

  if (records.length > 0) {
    for (const col of decl.columns) {
      // `Object.hasOwn`, not `col.name in records[0]`: the latter walks
      // the prototype chain, so a column named like an `Object.prototype`
      // member (`toString`, `valueOf`, `constructor`, …) matched the
      // inherited member even when the record lacked the key — bypassing
      // the missing-field error and silently dropping the column.
      if (!Object.hasOwn(records[0]!, col.name)) {
        throw new Error(`${source}: missing field '${col.name}'`);
      }
    }
  }

  return records.map((record, i) => {
    const lineNum = lineNumOf(i);
    const out: Record<string, unknown> = {};
    for (const col of decl.columns) {
      // `Object.hasOwn`, not `raw === undefined`: a column named like an
      // `Object.prototype` member would read the inherited function
      // (which is not `undefined`) and slip past the short-row check.
      if (!Object.hasOwn(record, col.name)) {
        // Distinct from a legitimately empty cell (`""`): csv-parse with
        // `relax_column_count: true` accepts short rows by simply omitting
        // the trailing keys, so a missing key here means the row had
        // fewer cells than the header.
        throw new Error(`${source} line ${lineNum}: missing field '${col.name}'`);
      }
      const raw = record[col.name]!;
      out[col.name] = coerceColumnValue(
        raw,
        col,
        `${source} line ${lineNum}, column '${col.name}'`,
      );
    }
    return out;
  });
}
