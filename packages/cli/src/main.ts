#!/usr/bin/env bun
import { dirname, extname, resolve } from "node:path";
import type { ExtDecl, Program } from "datamog-core";
import { analyze, findInfiniteRisks, inferTypes } from "datamog-core";
import { CsvLoader, parseCsvContent } from "datamog-csv";
import {
  type Backend,
  DatamogExecutor,
  type ExtensionalLoader,
  type LoadResult,
  type SqlDialect,
  expandGitHubShorthand,
  insertRows,
  rowsToMermaid,
  translate,
} from "datamog-engine";
import { type GSheetAuth, GSheetLoader } from "datamog-gsheet";
import { JsonLoader, parseJsonContent } from "datamog-json";
import { JsonlLoader, parseJsonlContent } from "datamog-jsonl";
import {
  MermaidLoader,
  mermaidEdgesToRows,
  parseMermaidGraph,
  validateMermaidColumns,
} from "datamog-mermaid";
import { parse } from "datamog-parser";
import { bigintSafeReplacer, formatCellAsString, prettifyProofRows } from "./output.ts";
import { runRepl } from "./repl-driver.ts";

function usage(exitCode = 1): never {
  console.error("Usage: datamog [options] [program.dl] [data-directory]");
  console.error("       datamog --repl [--json] [options]");
  console.error();
  console.error("  program.dl       Path to a Datamog (.dl) source file");
  console.error("  data-directory   Directory containing data files for extensional predicates");
  console.error("                   (defaults to the directory containing the .dl file)");
  console.error("  no program.dl    Start an interactive REPL");
  console.error();
  console.error("Options:");
  console.error(
    "  --repl                     Start an interactive REPL (default with no .dl file)",
  );
  console.error("  --json                     In REPL mode, emit ndjson events on stdout");
  console.error("  --data-dir <path>          Directory loaders read from in --repl mode");
  console.error("                             (defaults to the current working directory)");
  console.error(
    "  --extensional name=source  Map a predicate to a file or URL (.csv/.jsonl/.json/.mmd),",
  );
  console.error(
    "                             a Google Sheets URL (public sheets work without auth), or a",
  );
  console.error(
    "                             GitHub shorthand github:OWNER/REPO/PATH[#REF] (gh: alias;",
  );
  console.error("                             REF defaults to HEAD)");
  console.error(
    "  --output-format <format>   Output format: table (default), csv, jsonl, jsonl-flat,",
  );
  console.error("                             mermaid, or ascii-graph");
  console.error("  --csv-no-header            CSV files have no header row");
  console.error("  --dry-run                  Print generated SQL without executing");
  console.error("  --warn-finiteness          Print a warning for each predicate column whose");
  console.error("                             values may grow unboundedly across iterations");
  console.error(
    "  --backend <backend>        Backend: postgres, sqlite, sqljs, native, or seminaive",
  );
  console.error(
    "                             (default: postgres if DATABASE_URL is set, else sqlite)",
  );
  console.error("  -h, --help                 Show this help message");
  console.error();
  console.error("Environment:");
  console.error(
    "  DATABASE_URL                    Postgres connection string (uses in-memory SQLite if not set)",
  );
  console.error(
    "  GOOGLE_API_KEY                  API key for Google Sheets (public sheets, read-only)",
  );
  console.error("  GOOGLE_SERVICE_ACCOUNT_EMAIL    Service account email (for private sheets)");
  console.error(
    "  GOOGLE_PRIVATE_KEY              Service account private key (for private sheets)",
  );
  process.exit(exitCode);
}

const BACKEND_NAMES = ["postgres", "sqlite", "sqljs", "native", "seminaive"] as const;
type BackendName = (typeof BACKEND_NAMES)[number];

const OUTPUT_FORMATS = ["table", "csv", "jsonl", "jsonl-flat", "mermaid", "ascii-graph"] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

function isBackendName(value: string | undefined): value is BackendName {
  return value !== undefined && (BACKEND_NAMES as readonly string[]).includes(value);
}

function isOutputFormat(value: string | undefined): value is OutputFormat {
  return value !== undefined && (OUTPUT_FORMATS as readonly string[]).includes(value);
}

async function createSqlDialect(name: BackendName): Promise<SqlDialect> {
  switch (name) {
    case "postgres": {
      const { PostgresSqlDialect } = await import("datamog-backend-postgres");
      return new PostgresSqlDialect();
    }
    case "sqljs":
    case "sqlite": {
      const { SqliteSqlDialect } = await import("datamog-backend-sqlite");
      return new SqliteSqlDialect();
    }
    case "native":
      throw new Error("--dry-run is not supported for the native backend (no SQL is produced)");
    case "seminaive":
      throw new Error("--dry-run is not supported for the seminaive backend (no SQL is produced)");
  }
}

async function createBackend(name: BackendName): Promise<Backend> {
  switch (name) {
    case "postgres": {
      const { create } = await import("datamog-backend-postgres");
      return create();
    }
    case "sqljs": {
      const { create } = await import("datamog-backend-sqljs");
      return create();
    }
    case "sqlite": {
      const { create } = await import("datamog-backend-sqlite");
      return create();
    }
    case "native": {
      const { create } = await import("datamog-backend-native");
      return create();
    }
    case "seminaive": {
      const { create } = await import("datamog-backend-seminaive");
      return create();
    }
  }
}

// Exported so a focused unit test can verify the spreadsheet-ID
// extraction without invoking the loader (which needs network + auth).
// `[^/?#]+` stops at the path separator, the query-string boundary, AND
// the URL fragment marker — bare `[^/]+` would let a `?gid=...` query
// or a `#fragment` leak into the captured ID, producing a malformed
// CSV-export URL when the loader appends `/export?format=csv`.
export const GSHEET_URL_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/?#]+)/;

export type ExplicitSourceFormat = ".csv" | ".jsonl" | ".json" | ".mmd";
const EXPLICIT_SOURCE_FORMATS: readonly ExplicitSourceFormat[] = [
  ".csv",
  ".jsonl",
  ".json",
  ".mmd",
];

function httpUrlFor(source: string): URL | undefined {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export function explicitSourceFormat(source: string): ExplicitSourceFormat | undefined {
  const url = httpUrlFor(source);
  const ext = extname(url ? url.pathname : source).toLowerCase();
  return (EXPLICIT_SOURCE_FORMATS as readonly string[]).includes(ext)
    ? (ext as ExplicitSourceFormat)
    : undefined;
}

/**
 * Loader for an explicit source → predicate mapping via --extensional.
 */
export class ExplicitSourceLoader implements ExtensionalLoader {
  readonly name: string;
  private predicateName: string;
  private source: string;
  private format: ExplicitSourceFormat;
  private hasHeader: boolean;

  constructor(
    predicateName: string,
    source: string,
    format: ExplicitSourceFormat,
    hasHeader: boolean,
  ) {
    this.predicateName = predicateName;
    this.source = httpUrlFor(source)?.href ?? resolve(source);
    this.format = format;
    this.hasHeader = hasHeader;
    this.name = `explicit:${predicateName}`;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return decl.predicate === this.predicateName;
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const content = await this.readText();

    if (this.format === ".csv") {
      return this.loadCsv(content, decl, backend);
    }
    if (this.format === ".jsonl") {
      return this.loadJsonl(content, decl, backend);
    }
    if (this.format === ".json") {
      return this.loadJson(content, decl, backend);
    }
    if (this.format === ".mmd") {
      return this.loadMermaid(content, decl, backend);
    }
    throw new Error(
      `Unsupported source format '${this.format}' for predicate '${this.predicateName}'`,
    );
  }

  private async readText(): Promise<string> {
    const url = httpUrlFor(this.source);
    if (!url) {
      return Bun.file(this.source).text();
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch extensional source '${url.href}' for predicate '${this.predicateName}': ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }

  private async loadCsv(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const rows = parseCsvContent(content, decl, {
      hasHeader: this.hasHeader,
      source: this.source,
    });
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }

  private async loadJsonl(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const rows = parseJsonlContent(content, decl, { source: this.source });
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }

  private async loadJson(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const rows = parseJsonContent(content, decl, { source: this.source });
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }

  private async loadMermaid(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    validateMermaidColumns(decl);
    const rows = mermaidEdgesToRows(decl, parseMermaidGraph(content));
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }
}

function parseExtensionalArg(arg: string): { name: string; source: string } {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    console.error(`Invalid --extensional: expected name=source, got '${arg}'`);
    process.exit(1);
  }
  const name = arg.slice(0, eqIdx);
  const source = arg.slice(eqIdx + 1);
  // An empty name silently no-ops downstream (canLoad never matches a real
  // predicate), so the user sees their data not loaded with no diagnostic.
  // Surface it here.
  if (name === "") {
    console.error(`Invalid --extensional: name is empty in '${arg}'`);
    process.exit(1);
  }
  if (source === "") {
    console.error(`Invalid --extensional: source is empty in '${arg}'`);
    process.exit(1);
  }
  return { name, source };
}

function resolveGSheetAuth(): GSheetAuth | undefined {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return { serviceAccountEmail: email, privateKey: key };
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) {
    return { apiKey };
  }

  return undefined;
}

function buildExplicitLoaders(
  mappings: { name: string; source: string }[],
  csvHasHeader: boolean,
): ExtensionalLoader[] {
  // Reject `--extensional p=a --extensional p=b` — the duplicate would
  // silently no-op (the first loader wins, since `ExplicitSourceLoader.canLoad`
  // matches by predicate name and the executor stops at the first hit).
  // Without this check the user has no signal that the second flag had no
  // effect, which is genuinely confusing if it was a typo or override
  // attempt.
  const seen = new Map<string, string>();
  for (const { name, source } of mappings) {
    const prev = seen.get(name);
    if (prev !== undefined) {
      console.error(
        `--extensional for predicate '${name}' specified twice (first '${prev}', then '${source}')`,
      );
      process.exit(1);
    }
    seen.set(name, source);
  }

  const loaders: ExtensionalLoader[] = [];
  const gsheetSheets: Record<string, { spreadsheetId: string }> = {};

  for (const { name, source: rawSource } of mappings) {
    let source: string;
    try {
      source = expandGitHubShorthand(rawSource);
    } catch (e) {
      console.error(`Invalid --extensional ${name}=${rawSource}: ${(e as Error).message}`);
      process.exit(1);
    }

    const gsheetMatch = GSHEET_URL_RE.exec(source);
    if (gsheetMatch) {
      gsheetSheets[name] = { spreadsheetId: gsheetMatch[1]! };
      continue;
    }

    const format = explicitSourceFormat(source);
    if (!format) {
      const url = httpUrlFor(source);
      const ext = extname(url ? url.pathname : source).toLowerCase();
      console.error(
        `Unsupported source format '${ext}' for --extensional ${name}=${source} (expected ${EXPLICIT_SOURCE_FORMATS.join(", ")})`,
      );
      process.exit(1);
    }

    loaders.push(new ExplicitSourceLoader(name, source, format, csvHasHeader));
  }

  if (Object.keys(gsheetSheets).length > 0) {
    const auth = resolveGSheetAuth();
    loaders.push(new GSheetLoader({ auth, sheets: gsheetSheets }));
  }

  return loaders;
}

function validateExtensionalMappings(
  mappings: { name: string; source: string }[],
  program: Program,
): void {
  if (mappings.length === 0) return;
  const extNames = new Set(
    program.statements
      .filter((stmt): stmt is ExtDecl => stmt.$type === "ExtDecl")
      .map((stmt) => stmt.predicate),
  );

  for (const { name } of mappings) {
    if (extNames.has(name)) continue;
    console.error(`--extensional references unknown extensional predicate '${name}'`);
    if (extNames.size === 0) {
      console.error("Program declares no extensional predicates.");
    } else {
      console.error(`Available extensional predicates: ${[...extNames].join(", ")}`);
    }
    process.exit(1);
  }
}

async function printResult(header: string, rows: Record<string, unknown>[], format: OutputFormat) {
  switch (format) {
    case "table":
      console.log(`-- ${header}`);
      if (rows.length === 0) {
        // Empty result set — no binding satisfied the query.
        console.log("no");
      } else if (rows.length === 1 && Object.keys(rows[0]!).length === 0) {
        // Ground query with at least one matching binding — the
        // projection is empty, so all matches collapse to one
        // zero-column row.
        console.log("yes");
      } else {
        console.table(prettifyProofRows(rows));
      }
      console.log();
      break;
    case "csv": {
      if (rows.length === 0) break;
      const keys = Object.keys(rows[0]!);
      console.log(keys.join(","));
      for (const row of rows) {
        console.log(keys.map((k) => csvEscape(formatCellAsString(row[k]))).join(","));
      }
      break;
    }
    case "jsonl":
      for (const row of rows) {
        console.log(JSON.stringify(row, bigintSafeReplacer));
      }
      break;
    case "jsonl-flat":
      for (const row of rows) {
        console.log(JSON.stringify(Object.values(row), bigintSafeReplacer));
      }
      break;
    case "mermaid":
      console.log(rowsToMermaid(rows));
      break;
    case "ascii-graph": {
      if (rows.length === 0) break;
      const { renderMermaidASCII } = await import("beautiful-mermaid");
      console.log(renderMermaidASCII(rowsToMermaid(rows)));
      break;
    }
  }
}

function emitFinitenessWarnings(analyzed: Parameters<typeof findInfiniteRisks>[0]): void {
  const diags = findInfiniteRisks(analyzed);
  for (const d of diags) {
    console.error(`warning: ${d.message}`);
  }
}

function csvEscape(value: string): string {
  // `\r` on its own (old-Mac line endings) is as structurally significant
  // for CSV as `\n`; without it a value containing a bare CR would leak
  // through unquoted and corrupt the row layout on reparse.
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);

  let dlPath: string | undefined;
  let dataDir: string | undefined;
  let dryRun = false;
  let csvNoHeader = false;
  let warnFiniteness = false;
  let backendOverride: BackendName | undefined;
  let outputFormat: OutputFormat = "table";
  let replMode = false;
  let jsonMode = false;
  const extMappings: { name: string; source: string }[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--csv-no-header") {
      csvNoHeader = true;
    } else if (arg === "--warn-finiteness") {
      warnFiniteness = true;
    } else if (arg === "--repl") {
      replMode = true;
    } else if (arg === "--json") {
      jsonMode = true;
    } else if (arg === "--data-dir") {
      const value = args[++i];
      if (!value) {
        console.error("--data-dir requires a path");
        process.exit(1);
      }
      dataDir = value;
    } else if (arg === "--backend") {
      const value = args[++i];
      if (!isBackendName(value)) {
        console.error(`Invalid backend: ${value} (expected ${BACKEND_NAMES.join(", ")})`);
        process.exit(1);
      }
      backendOverride = value;
    } else if (arg === "--output-format") {
      const value = args[++i];
      if (!isOutputFormat(value)) {
        console.error(`Invalid output format: ${value} (expected ${OUTPUT_FORMATS.join(", ")})`);
        process.exit(1);
      }
      outputFormat = value;
    } else if (arg === "--extensional") {
      const value = args[++i];
      if (!value) {
        console.error("--extensional requires an argument (name=source)");
        process.exit(1);
      }
      extMappings.push(parseExtensionalArg(value));
    } else if (arg.startsWith("--extensional=")) {
      extMappings.push(parseExtensionalArg(arg.slice("--extensional=".length)));
    } else if (arg === "--help" || arg === "-h") {
      usage(0);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      usage();
    } else if (!dlPath) {
      dlPath = arg;
    } else if (!dataDir) {
      dataDir = arg;
    } else {
      console.error(`Unexpected argument: ${arg}`);
      usage();
    }
  }

  const shouldRunRepl = replMode || !dlPath;

  if (shouldRunRepl) {
    if (dlPath) {
      console.error("--repl does not take a .dl file argument");
      process.exit(1);
    }
    if (dryRun || warnFiniteness || outputFormat !== "table") {
      console.error(
        "REPL mode is incompatible with --dry-run / --warn-finiteness / --output-format",
      );
      process.exit(1);
    }
    const backendName: BackendName =
      backendOverride ?? (process.env.DATABASE_URL ? "postgres" : "sqlite");
    if (backendName === "postgres" && !process.env.DATABASE_URL) {
      console.error("Error: DATABASE_URL environment variable is required for --backend postgres");
      process.exit(1);
    }
    const explicitLoaders = buildExplicitLoaders(extMappings, !csvNoHeader);
    await runRepl({
      backendName,
      jsonMode,
      dataDir: dataDir ? resolve(dataDir) : process.cwd(),
      csvHasHeader: !csvNoHeader,
      explicitLoaders,
      createBackend: () => createBackend(backendName),
    });
    return;
  }

  if (jsonMode) {
    console.error("--json is only valid together with --repl");
    process.exit(1);
  }

  const programPath = dlPath;
  if (!programPath) {
    usage();
  }

  const dlFile = Bun.file(resolve(programPath));
  if (!(await dlFile.exists())) {
    console.error(`File not found: ${programPath}`);
    process.exit(1);
  }

  dataDir = dataDir ? resolve(dataDir) : dirname(resolve(programPath));
  const source = await dlFile.text();
  let parsedForCli: Program | undefined;
  const parseForCli = () => {
    if (!parsedForCli) parsedForCli = parse(source);
    return parsedForCli;
  };
  const backendName: BackendName =
    backendOverride ?? (process.env.DATABASE_URL ? "postgres" : "sqlite");

  if (extMappings.length > 0) validateExtensionalMappings(extMappings, parseForCli());

  // Check query count for machine-readable formats
  if (outputFormat !== "table") {
    const program = parseForCli();
    const queryCount = program.statements.filter((s) => s.$type === "Query").length;
    if (queryCount !== 1) {
      console.error(
        `--output-format ${outputFormat} requires exactly one query clause, but found ${queryCount}`,
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    const analyzed = inferTypes(analyze(parseForCli()));
    if (warnFiniteness) emitFinitenessWarnings(analyzed);
    const sqlDialect = await createSqlDialect(backendName);
    const translation = translate(analyzed, sqlDialect);

    for (const stmt of translation.createTables) {
      console.log(stmt);
      console.log();
    }
    for (const stmt of translation.createViews) {
      console.log(stmt);
      console.log();
    }
    for (const stmt of translation.queries) {
      console.log(stmt);
      console.log();
    }
    return;
  }

  if (warnFiniteness) {
    // Outside of --dry-run, the executor parses internally; we redo the
    // parse+analyse pair here so the warnings appear before any SQL or
    // table output. It's quick on tutorial-sized programs.
    emitFinitenessWarnings(inferTypes(analyze(parseForCli())));
  }

  if (backendName === "postgres" && !process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is required for --backend postgres");
    process.exit(1);
  }

  const explicitLoaders = buildExplicitLoaders(extMappings, !csvNoHeader);
  const backend = await createBackend(backendName);
  const executor = new DatamogExecutor(backend, [
    ...explicitLoaders,
    new CsvLoader({ directory: dataDir, hasHeader: !csvNoHeader }),
    // The JSONL loader's single-json-column case also matches `.jsonl`
    // files, so place the JSON file loader earlier — its `canLoad`
    // checks for a `.json` (singular) file specifically, so the two
    // don't compete on the same predicate.
    new JsonLoader({ directory: dataDir }),
    new JsonlLoader({ directory: dataDir }),
    new MermaidLoader({ directory: dataDir }),
  ]);

  try {
    const results = await executor.execute(source);

    if (outputFormat === "mermaid" || outputFormat === "ascii-graph") {
      for (const result of results) {
        if (result.rows.length > 0) {
          const colCount = Object.keys(result.rows[0]!).length;
          // 2 columns => `src --> dst`; 3 columns => `src -- label --> dst`
          // (matches the playground's 3-column support and the Mermaid loader,
          // which already accepts a binary or ternary edge predicate).
          if (colCount !== 2 && colCount !== 3) {
            console.error(
              `--output-format ${outputFormat} requires a binary or ternary predicate (2 or 3 columns), but got ${colCount}`,
            );
            process.exit(1);
          }
        }
      }
    }

    for (const result of results) {
      // Named outputs print under the output predicate's name. Otherwise the
      // native backend yields no SQL, so fall back to the Datalog query text.
      const header = result.label ?? (result.sql === "" ? (result.source ?? "") : result.sql);
      await printResult(header, result.rows, outputFormat);
    }
  } finally {
    await backend.close();
  }
}

// Top-level run only when invoked directly (`bun run main.ts`); skip when
// imported (e.g. by unit tests that exercise small helpers like
// `GSHEET_URL_RE`).
if (import.meta.main) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
