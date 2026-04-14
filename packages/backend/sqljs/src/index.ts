import type { Backend } from "datamog-engine";
import { SqliteSqlDialect } from "datamog-backend-sqlite";

export { SqliteSqlDialect } from "datamog-backend-sqlite";

export async function create(): Promise<Backend> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
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
