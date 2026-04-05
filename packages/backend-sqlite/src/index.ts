import { Database } from "bun:sqlite";
import type { Backend } from "datamog-postgres";

export function createSqliteBackend(path = ":memory:"): Backend {
  const db = new Database(path);
  return {
    dialect: "sqlite",
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      if (params && params.length > 0) {
        return db.prepare(query).all(...params) as Record<string, unknown>[];
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
