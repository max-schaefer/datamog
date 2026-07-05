import { parse as parseCsv } from "csv-parse/sync";
import type { ExtDecl } from "datamog-core";
import type { Backend, ExtensionalLoader, LoadResult } from "datamog-engine";
import { type DirectoryLoader, createDirectoryLoader } from "datamog-engine/directory-loader";
import { csvRowsFromKeyed, csvRowsFromPositional } from "./parse-content.ts";

export interface CsvLoaderOptions {
  directory: string;
  hasHeader?: boolean;
  delimiter?: string;
}

export interface ParseCsvOptions {
  hasHeader?: boolean;
  delimiter?: string;
  /** Used in error messages to identify the source (file path or predicate name). */
  source?: string;
}

/**
 * Parse CSV content into typed rows according to `decl`. Shared between the
 * directory-based `CsvLoader` and the CLI's explicit-file loader so both
 * honour quoted fields, configurable delimiters, and the --csv-no-header flag.
 *
 * Delegates the lexing to `csv-parse`, which is already a transitive
 * dependency via the gsheet loader. That gets us RFC 4180 line-ending
 * handling (CR/LF/CRLF as record separators), multi-line quoted fields,
 * BOM stripping, and `""` quote escaping for free.
 */
export function parseCsvContent(
  content: string,
  decl: ExtDecl,
  options: ParseCsvOptions = {},
): Record<string, unknown>[] {
  const hasHeader = options.hasHeader ?? true;
  const delimiter = options.delimiter ?? ",";
  const source = options.source ?? `${decl.predicate}.csv`;

  // `columns: false` returns an array of string-arrays so the caller controls
  // how header rows are interpreted. Skipping empty lines matches the
  // previous loader's "blank line === record separator" behaviour and keeps
  // trailing newlines from producing a phantom empty record.
  // `bom: true` strips a UTF-8 BOM if present (Excel exports often include it).
  // `info: true` attaches per-record metadata — crucially `info.lines`, the
  // 1-based source line number — so a parse/type error on a row preceded
  // by blank lines points at the *actual* source line, not the post-skip
  // record index.
  let records: { record: string[]; info: { lines: number } }[];
  try {
    // The csv-parse sync API's TypeScript typings don't model the
    // `info: true` option's altered output shape, so cast through
    // `unknown`.
    records = parseCsv(content, {
      columns: false,
      delimiter,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      info: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${source}: ${message}`);
  }

  if (hasHeader) {
    const header = records[0]?.record;
    if (!header) return [];

    const seenHeaders = new Set<string>();
    for (const name of header) {
      if (seenHeaders.has(name)) {
        throw new Error(`${source}: duplicate field '${name}'`);
      }
      seenHeaders.add(name);
    }

    for (const col of decl.columns) {
      if (!header.includes(col.name)) {
        throw new Error(`${source}: missing field '${col.name}'`);
      }
    }

    const dataRecords = records.slice(1);
    const keyedRecords = dataRecords.map(({ record, info }) => {
      if (
        record.length > header.length ||
        (record.length < header.length && header.length === decl.columns.length)
      ) {
        throw new Error(
          `${source} line ${info.lines}: expected ${header.length} fields but got ${record.length}`,
        );
      }
      const out: Record<string, string> = {};
      for (let i = 0; i < record.length; i++) {
        out[header[i]!] = record[i]!;
      }
      return out;
    });
    return csvRowsFromKeyed(keyedRecords, decl, {
      source,
      lineNumOf: (i) => dataRecords[i]!.info.lines,
    });
  }

  const dataRecords = records;
  return csvRowsFromPositional(
    dataRecords.map(({ record, info }) => ({ fields: record, lineNum: info.lines })),
    decl,
    { source },
  );
}

export class CsvLoader implements ExtensionalLoader {
  readonly name = "csv";
  private readonly inner: DirectoryLoader;

  constructor(options: CsvLoaderOptions) {
    this.inner = createDirectoryLoader({
      name: "csv",
      extension: ".csv",
      directory: options.directory,
      parse: (content, decl) =>
        parseCsvContent(content, decl, {
          hasHeader: options.hasHeader,
          delimiter: options.delimiter,
        }),
    });
  }

  canLoad(decl: ExtDecl): Promise<boolean> {
    return this.inner.canLoad(decl);
  }

  load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    return this.inner.load(decl, backend);
  }

  /** Read and parse the CSV file into typed rows. Exposed for testing. */
  readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    return this.inner.readRows(decl);
  }
}
