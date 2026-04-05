#!/usr/bin/env bun
import { dirname, resolve } from "node:path";
import { analyze } from "datamog-core";
import { CsvLoader } from "datamog-csv";
import { parse } from "datamog-parser";
import { DatamogExecutor, createInMemoryDatabase, translate } from "datamog-postgres";

function usage(): never {
  console.error("Usage: datamog <program.dl> [csv-directory]");
  console.error();
  console.error("  program.dl     Path to a Datamog (.dl) source file");
  console.error("  csv-directory   Directory containing CSV files for extensional predicates");
  console.error("                  (defaults to the directory containing the .dl file)");
  console.error();
  console.error("Environment:");
  console.error("  DATABASE_URL   Postgres connection string (uses in-memory SQLite if not set)");
  console.error();
  console.error("Options:");
  console.error("  --dry-run      Print generated SQL without executing");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  let dlPath: string | undefined;
  let csvDir: string | undefined;
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
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
  const usePostgres = !!process.env.DATABASE_URL;
  const dialect = usePostgres ? "postgres" : "sqlite";

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

  let closeFn: (() => void) | undefined;

  if (usePostgres) {
    const sql = Bun.sql;
    const executor = new DatamogExecutor(sql, loaders, { dialect: "postgres" });
    try {
      await printResults(await executor.execute(source));
    } finally {
      await sql.close();
    }
  } else {
    const { sql, close } = createInMemoryDatabase();
    closeFn = close;
    const executor = new DatamogExecutor(sql, loaders, { dialect: "sqlite" });
    try {
      await printResults(await executor.execute(source));
    } finally {
      closeFn();
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
