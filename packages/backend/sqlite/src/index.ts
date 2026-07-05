import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { Backend } from "datamog-engine";
import { SqliteSqlDialect } from "./dialect.ts";

export { SqliteSqlDialect } from "./dialect.ts";

export async function create(path = ":memory:"): Promise<Backend> {
  const db = new Database(path);
  return {
    sqlDialect: new SqliteSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      const isSelect = query.trimStart().toUpperCase().startsWith("SELECT");
      // Symmetric with the sqljs backend and with the no-params branch
      // below: SELECT → materialise rows via `.all()`, anything else
      // → `.run()` (returns no rows). Previously the params path always
      // used `.all()` even for INSERTs, which works but is asymmetric.
      const bound = params && params.length > 0 ? (params as SQLQueryBindings[]) : undefined;
      if (isSelect) {
        return (bound ? db.prepare(query).all(...bound) : db.prepare(query).all()) as Record<
          string,
          unknown
        >[];
      }
      if (bound) {
        db.prepare(query).run(...bound);
      } else {
        db.run(query);
      }
      return [];
    },
    close(): void {
      db.close();
    },
  };
}
