import { DuckDBInstance, type DuckDBPreparedStatement } from "@duckdb/node-api";
import type { Backend } from "datamog-engine";
import { DuckDbSqlDialect } from "./dialect.ts";

export { DuckDbSqlDialect } from "./dialect.ts";

function bindParam(stmt: DuckDBPreparedStatement, index: number, value: unknown) {
  if (value === null || value === undefined) {
    stmt.bindNull(index);
  } else if (typeof value === "string") {
    stmt.bindVarchar(index, value);
  } else if (typeof value === "number") {
    if (Number.isInteger(value)) {
      stmt.bindInteger(index, value);
    } else {
      stmt.bindDouble(index, value);
    }
  } else if (typeof value === "boolean") {
    stmt.bindBoolean(index, value);
  } else if (typeof value === "bigint") {
    stmt.bindBigInt(index, value);
  } else {
    stmt.bindVarchar(index, String(value));
  }
}

export async function create(path = ":memory:"): Promise<Backend> {
  const instance = await DuckDBInstance.create(path);
  const conn = await instance.connect();

  return {
    sqlDialect: new DuckDbSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      if (params && params.length > 0) {
        const prepared = await conn.prepare(query);
        for (let i = 0; i < params.length; i++) {
          bindParam(prepared, i + 1, params[i]);
        }
        await prepared.run();
        return [];
      }
      if (query.trimStart().toUpperCase().startsWith("SELECT")) {
        const result = await conn.run(query);
        const columns = result.columnNames();
        const rows = await result.getRows();
        return rows.map((row) => {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i]!] = row[i];
          }
          return obj;
        });
      }
      await conn.run(query);
      return [];
    },
    close() {
      conn.closeSync();
      instance.closeSync();
    },
  };
}
