// Import the dialect via the deep `/dialect` entry rather than the
// package root: `datamog-backend-sqlite`'s root entry imports
// `bun:sqlite`, which Vite externalises in the browser bundle and then
// crashes on at parse time. The deep import is a pure SQL-text generator
// with no runtime deps, so it's safe to ship to the playground worker.
import { SqliteSqlDialect } from "datamog-backend-sqlite/dialect";
import type { Backend } from "datamog-engine";
import type { Database } from "sql.js";

export { SqliteSqlDialect } from "datamog-backend-sqlite/dialect";

/**
 * Wrap an already-initialised sql.js `Database` as a Datamog `Backend`.
 * Use this when you've loaded sql.js yourself (e.g. from a CDN in a
 * browser worker) and just need the execute/insertRows wiring. For the
 * default Node/Bun path, call `create()` instead — it loads sql.js via
 * the bundled npm package.
 */
export function sqljsBackendForDatabase(db: Database): Backend {
  return {
    sqlDialect: new SqliteSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      const isSelect = query.trimStart().toUpperCase().startsWith("SELECT");
      if (params && params.length > 0) {
        const bindObj: Record<string, unknown> = {};
        for (let i = 0; i < params.length; i++) {
          bindObj[`$${i + 1}`] = params[i];
        }
        if (isSelect) {
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
      if (isSelect) {
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
    close(): void {
      db.close();
    },
  };
}

export async function create(): Promise<Backend> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return sqljsBackendForDatabase(db);
}
