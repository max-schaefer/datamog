#!/usr/bin/env bun
import { dirname, extname, resolve } from "node:path";
import type { ExtDecl } from "datamog-core";
import { analyze } from "datamog-core";
import { CsvLoader } from "datamog-csv";
import {
  type Backend,
  DatamogExecutor,
  type ExtensionalLoader,
  type LoadResult,
  type SqlDialect,
  checkValue,
  coerceValue,
  translate,
} from "datamog-engine";
import { type GSheetAuth, GSheetLoader } from "datamog-gsheet";
import { JsonlLoader } from "datamog-jsonl";
import { MermaidLoader, parseMermaidGraph } from "datamog-mermaid";
import { parse } from "datamog-parser";

function usage(): never {
  console.error("Usage: datamog [options] <program.dl> [data-directory]");
  console.error();
  console.error("  program.dl       Path to a Datamog (.dl) source file");
  console.error("  data-directory   Directory containing data files for extensional predicates");
  console.error("                   (defaults to the directory containing the .dl file)");
  console.error();
  console.error("Options:");
  console.error("  --extensional name=source  Map a predicate to a file (.csv/.jsonl/.mmd) or");
  console.error("                             a Google Sheets URL (requires GOOGLE_API_KEY)");
  console.error(
    "  --output-format <format>   Output format: table (default), csv, jsonl, jsonl-flat,",
  );
  console.error("                             mermaid, or ascii-graph");
  console.error("  --dry-run                  Print generated SQL without executing");
  console.error(
    "  --backend <backend>        Backend: postgres, sqlite, duckdb, or sqljs (default: auto)",
  );
  console.error("  -h, --help                 Show this help message");
  console.error();
  console.error("Environment:");
  console.error(
    "  DATABASE_URL                    Postgres connection string (uses in-memory DuckDB if not set)",
  );
  console.error(
    "  GOOGLE_API_KEY                  API key for Google Sheets (public sheets, read-only)",
  );
  console.error("  GOOGLE_SERVICE_ACCOUNT_EMAIL    Service account email (for private sheets)");
  console.error(
    "  GOOGLE_PRIVATE_KEY              Service account private key (for private sheets)",
  );
  process.exit(1);
}

type BackendName = "postgres" | "sqlite" | "duckdb" | "sqljs";
type OutputFormat = "table" | "csv" | "jsonl" | "jsonl-flat" | "mermaid" | "ascii-graph";

async function createSqlDialect(name: BackendName): Promise<SqlDialect> {
  switch (name) {
    case "postgres": {
      const { PostgresSqlDialect } = await import("datamog-backend-postgres");
      return new PostgresSqlDialect();
    }
    case "duckdb": {
      const { DuckDbSqlDialect } = await import("datamog-backend-duckdb");
      return new DuckDbSqlDialect();
    }
    case "sqljs":
    case "sqlite": {
      const { SqliteSqlDialect } = await import("datamog-backend-sqlite");
      return new SqliteSqlDialect();
    }
  }
}

async function createBackend(name: BackendName): Promise<Backend> {
  switch (name) {
    case "postgres": {
      const { create } = await import("datamog-backend-postgres");
      return create();
    }
    case "duckdb": {
      const { create } = await import("datamog-backend-duckdb");
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
  }
}

const GSHEET_URL_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/;

/**
 * Loader for an explicit file → predicate mapping via --extensional.
 */
class ExplicitFileLoader implements ExtensionalLoader {
  readonly name: string;
  private predicateName: string;
  private filePath: string;

  constructor(predicateName: string, filePath: string) {
    this.predicateName = predicateName;
    this.filePath = resolve(filePath);
    this.name = `explicit:${predicateName}`;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return decl.predicate === this.predicateName;
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const content = await Bun.file(this.filePath).text();
    const ext = extname(this.filePath).toLowerCase();

    if (ext === ".csv") {
      return this.loadCsv(content, decl, backend);
    }
    if (ext === ".jsonl") {
      return this.loadJsonl(content, decl, backend);
    }
    if (ext === ".mmd") {
      return this.loadMermaid(content, decl, backend);
    }
    throw new Error(`Unsupported file format '${ext}' for predicate '${this.predicateName}'`);
  }

  private async loadCsv(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    const dataLines = lines.slice(1);

    let rowsLoaded = 0;
    for (const [lineIndex, line] of dataLines.entries()) {
      const fields = line.split(",");
      if (fields.length !== decl.columns.length) {
        throw new Error(
          `${this.filePath} line ${lineIndex + 2}: expected ${decl.columns.length} fields but got ${fields.length}`,
        );
      }
      const values = decl.columns.map((c, i) =>
        coerceValue(
          fields[i]!,
          c.type,
          `${this.filePath} line ${lineIndex + 2}, column '${c.name}'`,
        ),
      );
      await this.insertRow(decl, values, backend);
      rowsLoaded++;
    }
    return { rowsLoaded };
  }

  private async loadJsonl(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    let rowsLoaded = 0;
    for (const [lineIndex, line] of lines.entries()) {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const values = decl.columns.map((c) => {
        if (!(c.name in obj)) {
          throw new Error(`${this.filePath} line ${lineIndex + 1}: missing field '${c.name}'`);
        }
        return checkValue(
          obj[c.name],
          c.type,
          `${this.filePath} line ${lineIndex + 1}, column '${c.name}'`,
        );
      });
      await this.insertRow(decl, values, backend);
      rowsLoaded++;
    }
    return { rowsLoaded };
  }

  private async loadMermaid(content: string, decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    if (decl.columns.length !== 2) {
      throw new Error(
        `Mermaid format requires a binary predicate (2 columns), but '${decl.predicate}' has ${decl.columns.length}`,
      );
    }
    const edges = parseMermaidGraph(content);

    let rowsLoaded = 0;
    for (const edge of edges) {
      await this.insertRow(decl, [edge.source, edge.target], backend);
      rowsLoaded++;
    }
    return { rowsLoaded };
  }

  private async insertRow(decl: ExtDecl, values: unknown[], backend: Backend) {
    const columns = decl.columns.map((c) => `"${c.name}"`).join(", ");
    const placeholders = decl.columns.map((_, i) => `$${i + 1}`).join(", ");
    await backend.execute(
      `INSERT INTO "${decl.predicate}" (${columns}) VALUES (${placeholders})`,
      values,
    );
  }
}

function parseExtensionalArg(arg: string): { name: string; source: string } {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    console.error(`Invalid --extensional: expected name=source, got '${arg}'`);
    process.exit(1);
  }
  return { name: arg.slice(0, eqIdx), source: arg.slice(eqIdx + 1) };
}

function resolveGSheetAuth(): GSheetAuth {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return { serviceAccountEmail: email, privateKey: key };
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) {
    return { apiKey };
  }

  console.error(
    "Google Sheets requires either GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY, or GOOGLE_API_KEY",
  );
  process.exit(1);
}

function buildExplicitLoaders(mappings: { name: string; source: string }[]): ExtensionalLoader[] {
  const loaders: ExtensionalLoader[] = [];
  const gsheetSheets: Record<string, { spreadsheetId: string }> = {};

  for (const { name, source } of mappings) {
    const gsheetMatch = GSHEET_URL_RE.exec(source);
    if (gsheetMatch) {
      gsheetSheets[name] = { spreadsheetId: gsheetMatch[1]! };
      continue;
    }

    const ext = extname(source).toLowerCase();
    if (ext !== ".csv" && ext !== ".jsonl" && ext !== ".mmd") {
      console.error(`Unsupported file format '${ext}' for --extensional ${name}=${source}`);
      process.exit(1);
    }

    loaders.push(new ExplicitFileLoader(name, source));
  }

  if (Object.keys(gsheetSheets).length > 0) {
    const auth = resolveGSheetAuth();
    loaders.push(new GSheetLoader({ auth, sheets: gsheetSheets }));
  }

  return loaders;
}

async function printResult(sql: string, rows: Record<string, unknown>[], format: OutputFormat) {
  switch (format) {
    case "table":
      console.log(`-- ${sql}`);
      if (rows.length === 0) {
        console.log("(no rows)");
      } else {
        console.table(rows);
      }
      console.log();
      break;
    case "csv": {
      if (rows.length === 0) break;
      const keys = Object.keys(rows[0]!);
      console.log(keys.join(","));
      for (const row of rows) {
        console.log(keys.map((k) => csvEscape(String(row[k] ?? ""))).join(","));
      }
      break;
    }
    case "jsonl":
      for (const row of rows) {
        console.log(JSON.stringify(row));
      }
      break;
    case "jsonl-flat":
      for (const row of rows) {
        console.log(JSON.stringify(Object.values(row)));
      }
      break;
    case "mermaid":
      if (rows.length === 0) break;
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

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function mermaidEscape(id: string): string {
  if (/^[\w][\w.-]*$/.test(id)) return id;
  const safeId = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${safeId}["${id.replace(/"/g, "#quot;")}"]`;
}

function rowsToMermaid(rows: Record<string, unknown>[]): string {
  const keys = Object.keys(rows[0]!);
  const lines = ["graph TD"];
  for (const row of rows) {
    const src = String(row[keys[0]!] ?? "");
    const dst = String(row[keys[1]!] ?? "");
    lines.push(`    ${mermaidEscape(src)} --> ${mermaidEscape(dst)}`);
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);

  let dlPath: string | undefined;
  let dataDir: string | undefined;
  let dryRun = false;
  let backendOverride: BackendName | undefined;
  let outputFormat: OutputFormat = "table";
  const extMappings: { name: string; source: string }[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--backend") {
      const value = args[++i];
      const validBackends: BackendName[] = ["postgres", "sqlite", "duckdb", "sqljs"];
      if (!validBackends.includes(value as BackendName)) {
        console.error(`Invalid backend: ${value} (expected ${validBackends.join(", ")})`);
        process.exit(1);
      }
      backendOverride = value as BackendName;
    } else if (arg === "--output-format") {
      const value = args[++i];
      const validFormats: OutputFormat[] = [
        "table",
        "csv",
        "jsonl",
        "jsonl-flat",
        "mermaid",
        "ascii-graph",
      ];
      if (!validFormats.includes(value as OutputFormat)) {
        console.error(`Invalid output format: ${value} (expected ${validFormats.join(", ")})`);
        process.exit(1);
      }
      outputFormat = value as OutputFormat;
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
      usage();
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

  if (!dlPath) {
    usage();
  }

  const dlFile = Bun.file(resolve(dlPath));
  if (!(await dlFile.exists())) {
    console.error(`File not found: ${dlPath}`);
    process.exit(1);
  }

  dataDir = dataDir ? resolve(dataDir) : dirname(resolve(dlPath));
  const source = await dlFile.text();
  const backendName: BackendName =
    backendOverride ?? (process.env.DATABASE_URL ? "postgres" : "duckdb");

  // Check query count for machine-readable formats
  if (outputFormat !== "table") {
    const program = parse(source);
    const queryCount = program.statements.filter((s) => s.$type === "Query").length;
    if (queryCount > 1) {
      console.error(
        `--output-format ${outputFormat} requires exactly one query clause, but found ${queryCount}`,
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    const program = parse(source);
    const analyzed = analyze(program);
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

  if (backendName === "postgres" && !process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is required for --backend postgres");
    process.exit(1);
  }

  const explicitLoaders = buildExplicitLoaders(extMappings);
  const backend = await createBackend(backendName);
  const executor = new DatamogExecutor(backend, [
    ...explicitLoaders,
    new CsvLoader({ directory: dataDir }),
    new JsonlLoader({ directory: dataDir }),
    new MermaidLoader({ directory: dataDir }),
  ]);

  try {
    const results = await executor.execute(source);

    if (outputFormat === "mermaid" || outputFormat === "ascii-graph") {
      for (const result of results) {
        if (result.rows.length > 0) {
          const colCount = Object.keys(result.rows[0]!).length;
          if (colCount !== 2) {
            console.error(
              `--output-format ${outputFormat} requires a binary predicate (2 columns), but got ${colCount}`,
            );
            process.exit(1);
          }
        }
      }
    }

    for (const result of results) {
      await printResult(result.sql, result.rows, outputFormat);
    }
  } finally {
    await backend.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
