import type { Backend } from "datamog-engine";

export function create(): Backend {
  const sql = Bun.sql;
  return {
    dialect: "postgres",
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
