#!/usr/bin/env bun
import { dirname, resolve } from "node:path";
import { analyze } from "datamog-core";
import { CsvLoader } from "datamog-csv";
import { parse } from "datamog-parser";
import { DatamogExecutor, type Dialect, createInMemoryDatabase, translate } from "datamog-postgres";

function usage(): never {
  console.error("Usage: datamog [options] <program.dl> [csv-directory]");
  console.error();
  console.error("  program.dl     Path to a Datamog (.dl) source file");
  console.error("  csv-directory   Directory containing CSV files for extensional predicates");
  console.error("                  (defaults to the directory containing the .dl file)");
  console.error();
  console.error("Options:");
  console.error("  --dry-run              Print generated SQL without executing");
  console.error("  --dialect <dialect>    SQL dialect: postgres or sqlite (default: auto)");
  console.error("  -h, --help             Show this help message");
  console.error();
  console.error("Environment:");
  console.error("  DATABASE_URL   Postgres connection string (uses in-memory SQLite if not set)");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  let dlPath: string | undefined;
  let csvDir: string | undefined;
  let dryRun = false;
  let dialectOverride: Dialect | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--dialect") {
      const value = args[++i];
      if (value !== "postgres" && value !== "sqlite") {
        console.error(`Invalid dialect: ${value} (expected "postgres" or "sqlite")`);
        process.exit(1);
      }
      dialectOverride = value;
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
  const usePostgres = dialectOverride ? dialectOverride === "postgres" : !!process.env.DATABASE_URL;
  const dialect: Dialect = usePostgres ? "postgres" : "sqlite";

  if (dryRun) {
    const program = parse(source);
    const analyzed = analyze(program);
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

  const loaders = [new CsvLoader({ directory: csvDir })];

  if (usePostgres) {
    if (!process.env.DATABASE_URL) {
      console.error("Error: DATABASE_URL environment variable is required for --dialect postgres");
      process.exit(1);
    }
    const sql = Bun.sql;
    const executor = new DatamogExecutor(sql, loaders, { dialect: "postgres" });
    try {
      await printResults(await executor.execute(source));
    } finally {
      await sql.close();
    }
  } else {
    const { sql, close } = createInMemoryDatabase();
    const executor = new DatamogExecutor(sql, loaders, { dialect: "sqlite" });
    try {
      await printResults(await executor.execute(source));
    } finally {
      close();
    }
  }
}

async function printResults(results: { sql: string; rows: Record<string, unknown>[] }[]) {
  for (const result of results) {
    console.log(`-- ${result.sql}`);
    if (result.rows.length === 0) {
      console.log("(no rows)");
    } else {
      console.table(result.rows);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
