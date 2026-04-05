import { Database } from "bun:sqlite";
import type { BunSQL } from "./loader.ts";

/** Wraps a bun:sqlite Database to match the BunSQL interface used by DatamogExecutor. */
export function createSqliteAdapter(db: Database): BunSQL {
  return {
    async unsafe(query: string, values?: unknown[]): Promise<unknown[]> {
      if (values && values.length > 0) {
        return db.prepare(query).all(...values) as unknown[];
      }
      db.run(query);
      // For SELECT statements, return rows; for DDL, return empty
      if (query.trimStart().toUpperCase().startsWith("SELECT")) {
        return db.prepare(query).all() as unknown[];
      }
      return [];
    },
  } as BunSQL;
}

/** Creates an in-memory SQLite database wrapped as BunSQL. */
export function createInMemoryDatabase(): { sql: BunSQL; close: () => void } {
  const db = new Database(":memory:");
  return {
    sql: createSqliteAdapter(db),
    close: () => db.close(),
  };
}
