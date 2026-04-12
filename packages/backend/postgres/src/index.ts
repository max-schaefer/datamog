import type { Backend } from "datamog-engine";
import { PostgresSqlDialect } from "./dialect.ts";

export { PostgresSqlDialect } from "./dialect.ts";

export function create(): Backend {
  const sql = Bun.sql;
  return {
    sqlDialect: new PostgresSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      if (params && params.length > 0) {
        return sql.unsafe(query, params) as Promise<Record<string, unknown>[]>;
      }
      return sql.unsafe(query) as Promise<Record<string, unknown>[]>;
    },
    async close() {
      await sql.close();
    },
  };
}
