#!/usr/bin/env bun
import { dirname, resolve } from "node:path";
import { analyze } from "datamog-core";
import { CsvLoader } from "datamog-csv";
import { parse } from "datamog-parser";
import { type Backend, DatamogExecutor, translate } from "datamog-postgres";

function usage(): never {
  console.error("Usage: datamog [options] <program.dl> [csv-directory]");
  console.error();
  console.error("  program.dl     Path to a Datamog (.dl) source file");
  console.error("  csv-directory   Directory containing CSV files for extensional predicates");
  console.error("                  (defaults to the directory containing the .dl file)");
  console.error();
  console.error("Options:");
  console.error("  --dry-run              Print generated SQL without executing");
  console.error("  --backend <backend>    Backend: postgres or sqlite (default: auto)");
  console.error("  -h, --help             Show this help message");
  console.error();
  console.error("Environment:");
  console.error("  DATABASE_URL   Postgres connection string (uses in-memory SQLite if not set)");
  process.exit(1);
}

type BackendName = "postgres" | "sqlite";

async function createBackend(name: BackendName): Promise<Backend> {
  if (name === "postgres") {
    const { createPostgresBackend } = await import("datamog-backend-postgres");
    return createPostgresBackend();
  }
  const { createSqliteBackend } = await import("datamog-backend-sqlite");
  return createSqliteBackend();
}

async function main() {
  const args = process.argv.slice(2);

  let dlPath: string | undefined;
  let csvDir: string | undefined;
  let dryRun = false;
  let backendOverride: BackendName | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--backend") {
      const value = args[++i];
      if (value !== "postgres" && value !== "sqlite") {
        console.error(`Invalid backend: ${value} (expected "postgres" or "sqlite")`);
        process.exit(1);
      }
      backendOverride = value;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      usage();
    } else if (!dlPath) {
      dlPath = arg;
    } else if (!csvDir) {
      csvDir = arg;
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

  csvDir = csvDir ? resolve(csvDir) : dirname(resolve(dlPath));
  const source = await dlFile.text();
  const backendName: BackendName =
    backendOverride ?? (process.env.DATABASE_URL ? "postgres" : "sqlite");

  if (dryRun) {
    const program = parse(source);
    const analyzed = analyze(program);
    const dialect = backendName === "postgres" ? "postgres" : "sqlite";
    const translation = translate(analyzed, { dialect });

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

  const backend = await createBackend(backendName);
  const executor = new DatamogExecutor(backend, [new CsvLoader({ directory: csvDir })]);

  try {
    const results = await executor.execute(source);
    for (const result of results) {
      console.log(`-- ${result.sql}`);
      if (result.rows.length === 0) {
        console.log("(no rows)");
      } else {
        console.table(result.rows);
      }
      console.log();
    }
  } finally {
    await backend.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
