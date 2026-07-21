// Use the browser-friendly entry point: `csv-parse/sync` pulls in code
// paths that reference Node's `Buffer` global (`Buffer.allocUnsafe`,
// `Buffer.from(..., encoding)` …), which Vite doesn't polyfill — so the
// playground would crash on first parse with `ReferenceError: Buffer is
// not defined`. The `browser/esm/sync` build inlines a base64/byte-array
// shim so it runs in the browser without any polyfill.
import { parse as parseCsv } from "csv-parse/browser/esm/sync";
import type { ExtDecl } from "datamog-core";
// `datamog-csv/parse-content` deliberately avoids importing csv-parse so
// it's safe to pull into the browser bundle. The package's main entry
// (`datamog-csv`) imports `csv-parse/sync` and would not be browser-safe.
import { csvRowsFromKeyed } from "datamog-csv/parse-content";
import {
  type Backend,
  type ExtensionalLoader,
  type LoadResult,
  expandGitHubShorthand,
  insertRows,
} from "datamog-engine";

async function loadCsvContent(
  predicate: string,
  content: string,
  decl: ExtDecl,
  backend: Backend,
  source: string,
): Promise<LoadResult> {
  let parsed: { record: string[]; info: { lines: number } }[];
  try {
    // `info: true` preserves the source line for each data record even
    // when blank lines are skipped, so diagnostics point at the row the
    // user sees in the editor rather than at the post-filter record index.
    parsed = parseCsv(content, {
      columns: false,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      info: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`CSV parse error for '${predicate}': ${message}`);
  }

  const header = parsed[0]?.record;
  if (!header) return { rowsLoaded: 0 };

  const seenHeaders = new Set<string>();
  for (const name of header) {
    if (seenHeaders.has(name)) {
      throw new Error(`${predicate}: duplicate field '${name}'`);
    }
    seenHeaders.add(name);
  }

  for (const col of decl.columns) {
    if (!header.includes(col.name)) {
      throw new Error(`${predicate}: missing field '${col.name}'`);
    }
  }

  const dataRecords = parsed.slice(1);
  const records = dataRecords.map(({ record, info }) => {
    if (record.length > header.length) {
      throw new Error(
        `${predicate} line ${info.lines}: expected ${header.length} fields but got ${record.length}`,
      );
    }
    const out: Record<string, string> = {};
    for (let i = 0; i < record.length; i++) {
      out[header[i]!] = record[i]!;
    }
    return out;
  });

  // `csvRowsFromKeyed` runs each cell through `coerceValue`.
  const rows = csvRowsFromKeyed(records, decl, {
    source,
    lineNumOf: (i) => dataRecords[i]!.info.lines,
  });
  await insertRows(backend, decl, rows);

  return { rowsLoaded: rows.length };
}

export class InMemoryCsvLoader implements ExtensionalLoader {
  readonly name = "in-memory-csv";
  private csvData: Map<string, string>;

  constructor(csvData: Map<string, string>) {
    this.csvData = csvData;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return this.csvData.has(decl.predicate);
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const content = this.csvData.get(decl.predicate)!;
    return loadCsvContent(decl.predicate, content, decl, backend, decl.predicate);
  }
}

export class UrlCsvLoader implements ExtensionalLoader {
  readonly name = "url-csv";
  private csvUrls: Map<string, string>;

  constructor(csvUrls: Map<string, string>) {
    this.csvUrls = csvUrls;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    const url = this.csvUrls.get(decl.predicate);
    return url !== undefined && url.trim() !== "";
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    // Accept the `gh:OWNER/REPO/PATH` shorthand (and `github:`) here too,
    // so a CSV-URL field can use the same concise form as the CLI's
    // `--input`. Plain http(s) URLs pass through untouched.
    const rawUrl = expandGitHubShorthand(this.csvUrls.get(decl.predicate)!.trim());
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`CSV URL for '${decl.predicate}' must use HTTP or HTTPS`);
    }

    const response = await fetch(url.href);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch CSV URL for '${decl.predicate}': ${response.status} ${response.statusText}`,
      );
    }

    const content = await response.text();
    return loadCsvContent(decl.predicate, content, decl, backend, url.href);
  }
}
