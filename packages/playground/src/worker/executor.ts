import { analyze, inferTypes } from "datamog-core";
import { type Backend, DatamogExecutor, type QueryResult, translate } from "datamog-engine";
import type { SqlDialect } from "datamog-engine";
import { SqliteSqlDialect } from "datamog-backend-sqlite/dialect";
import { PostgresSqlDialect } from "datamog-backend-postgres/dialect";
import { DuckDbSqlDialect } from "datamog-backend-duckdb/dialect";
import { parse } from "datamog-parser";
import { InMemoryCsvLoader } from "../lib/csv-loader.ts";

export type BackendName = "sqlite" | "postgres" | "duckdb";

function dialectFor(name: BackendName): SqlDialect {
  switch (name) {
    case "sqlite":
      return new SqliteSqlDialect();
    case "postgres":
      return new PostgresSqlDialect();
    case "duckdb":
      return new DuckDbSqlDialect();
  }
}

interface InitMessage {
  type: "init";
}

interface ExecuteMessage {
  type: "execute";
  id: number;
  source: string;
  csvData: Record<string, string>;
}

interface DryRunMessage {
  type: "dry-run";
  id: number;
  source: string;
  backend: BackendName;
}

interface LintMessage {
  type: "lint";
  id: number;
  source: string;
}

type WorkerMessage = InitMessage | ExecuteMessage | DryRunMessage | LintMessage;

const SQL_JS_CDN = "https://sql.js.org/dist";

// biome-ignore lint/suspicious/noExplicitAny: sql.js types vary by bundler
let sqlModule: any = null;

async function ensureSqlJs() {
  if (!sqlModule) {
    // sql.js is a UMD bundle that Vite can't import as ESM in a module worker.
    // Load it via fetch + globalThis eval, which is how it's designed to work in browsers.
    const response = await fetch(`${SQL_JS_CDN}/sql-wasm.js`);
    const scriptText = await response.text();
    // biome-ignore lint/security/noGlobalEval: sql.js UMD needs global eval to register initSqlJs
    (0, eval)(scriptText);
    // biome-ignore lint/suspicious/noExplicitAny: set by sql.js UMD script
    const initSqlJs = (globalThis as any).initSqlJs;
    sqlModule = await initSqlJs({
      locateFile: (file: string) => `${SQL_JS_CDN}/${file}`,
    });
  }
  return sqlModule;
}

// biome-ignore lint/suspicious/noExplicitAny: sql.js module shape
function createBackend(SQL: any): Backend {
  const db = new SQL.Database();
  return {
    sqlDialect: new SqliteSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      if (params && params.length > 0) {
        const bindObj: Record<string, unknown> = {};
        for (let i = 0; i < params.length; i++) {
          bindObj[`$${i + 1}`] = params[i];
        }
        if (query.trimStart().toUpperCase().startsWith("SELECT")) {
          const stmt = db.prepare(query);
          stmt.bind(bindObj);
          const rows: Record<string, unknown>[] = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject() as Record<string, unknown>);
          }
          stmt.free();
          return rows;
        }
        db.run(query, bindObj);
        return [];
      }
      if (query.trimStart().toUpperCase().startsWith("SELECT")) {
        const results = db.exec(query);
        if (results.length === 0) return [];
        const { columns, values } = results[0]!;
        return values.map((row) => {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i]!] = row[i];
          }
          return obj;
        });
      }
      db.run(query);
      return [];
    },
    close() {
      db.close();
    },
  };
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      await ensureSqlJs();
      self.postMessage({ type: "init-done" });
    } catch (err) {
      self.postMessage({ type: "init-error", error: String(err) });
    }
    return;
  }

  if (msg.type === "execute") {
    try {
      const SQL = await ensureSqlJs();
      const backend = createBackend(SQL);
      const csvMap = new Map(Object.entries(msg.csvData));
      const loaders = csvMap.size > 0 ? [new InMemoryCsvLoader(csvMap)] : [];
      const executor = new DatamogExecutor(backend, loaders);
      const results = await executor.execute(msg.source);
      backend.close();
      self.postMessage({ type: "execute-result", id: msg.id, results });
    } catch (err) {
      self.postMessage({
        type: "execute-error",
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "dry-run") {
    try {
      const program = parse(msg.source);
      const analyzed = inferTypes(analyze(program));
      const result = translate(analyzed, dialectFor(msg.backend));
      self.postMessage({ type: "dry-run-result", id: msg.id, result });
    } catch (err) {
      self.postMessage({
        type: "dry-run-error",
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "lint") {
    try {
      const program = parse(msg.source);
      const analyzed = analyze(program);
      inferTypes(analyzed);
      self.postMessage({ type: "lint-result", id: msg.id, result: [] });
    } catch (err: unknown) {
      const diag: { message: string; from?: number; to?: number } = {
        message: err instanceof Error ? err.message : String(err),
      };
      if (err instanceof Error && err.name === "ParseError") {
        const { line, column } = err as Error & { line: number; column: number };
        diag.from = lineColumnToOffset(msg.source, line, column);
        diag.to = diag.from + 1;
      } else if (err instanceof Error && err.name === "AnalyzerError") {
        const { offset, end } = err as Error & { offset?: number; end?: number };
        diag.from = offset;
        diag.to = end;
      }
      self.postMessage({ type: "lint-result", id: msg.id, result: [diag] });
    }
  }
};

function lineColumnToOffset(source: string, line: number, column: number): number {
  let offset = 0;
  for (let i = 1; i < line; i++) {
    const nl = source.indexOf("\n", offset);
    if (nl === -1) break;
    offset = nl + 1;
  }
  return offset + column - 1;
}
