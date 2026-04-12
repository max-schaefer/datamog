import type { SqlDialect } from "./dialect.ts";

export interface Backend {
  readonly sqlDialect: SqlDialect;
  execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  close(): Promise<void> | void;
}
