import { analyze, inferTypes } from "datamog-core";
import { type Backend, DatamogExecutor, type QueryResult, translate } from "datamog-engine";
import { SqliteSqlDialect } from "datamog-backend-sqlite/dialect";
import { parse } from "datamog-parser";
import { InMemoryCsvLoader } from "../lib/csv-loader.ts";

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
}

type WorkerMessage = InitMessage | ExecuteMessage | DryRunMessage;

let sqlModule: typeof import("sql.js") | null = null;

async function ensureSqlJs() {
  if (!sqlModule) {
    const initSqlJs = (await import("sql.js")).default;
    sqlModule = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
  }
  return sqlModule;
}

function createBackend(SQL: typeof import("sql.js")): Backend {
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
      const result = translate(analyzed, new SqliteSqlDialect());
      self.postMessage({ type: "dry-run-result", id: msg.id, result });
    } catch (err) {
      self.postMessage({
        type: "dry-run-error",
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
