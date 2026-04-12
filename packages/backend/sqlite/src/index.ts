import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { Backend } from "datamog-engine";
import { SqliteSqlDialect } from "./dialect.ts";

export { SqliteSqlDialect } from "./dialect.ts";

export function create(path = ":memory:"): Backend {
  const db = new Database(path);
  return {
    sqlDialect: new SqliteSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      if (params && params.length > 0) {
        return db.prepare(query).all(...(params as SQLQueryBindings[])) as Record<
          string,
          unknown
        >[];
      }
      if (query.trimStart().toUpperCase().startsWith("SELECT")) {
        return db.prepare(query).all() as Record<string, unknown>[];
      }
      db.run(query);
      return [];
    },
    close() {
      db.close();
    },
  };
}
