import type { ExtDecl, TypedProgram } from "datamog-core";
import type { SqlDialect } from "./dialect.ts";
import type { ExtensionalLoader } from "./loader.ts";

export interface QueryResult {
  /** The SQL that produced this result (empty string for non-SQL backends). */
  sql: string;
  /** The original Datalog query source text, if available. */
  source?: string;
  rows: Record<string, unknown>[];
}

export interface Backend {
  /**
   * SQL dialect the backend expects. `null` for backends that evaluate
   * Datalog directly without going through a SQL translation (e.g. the
   * native naive evaluator).
   */
  readonly sqlDialect: SqlDialect | null;

  /**
   * Execute a SQL statement. Native-evaluation backends may throw here
   * since they have no SQL path — callers should route through
   * `evaluateProgram` or `insertRows` instead.
   */
  execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;

  close(): Promise<void> | void;

  /**
   * Bulk-insert rows into the table for `decl`. When omitted, the default
   * `insertRows` helper falls back to issuing one `INSERT` per row via
   * `execute`, which is what SQL backends want. Native backends provide
   * this to bypass SQL entirely.
   */
  insertRows?(decl: ExtDecl, rows: Record<string, unknown>[]): Promise<void>;

  /**
   * If present, the executor delegates the whole pipeline (loading,
   * view/IDB computation, query projection) here instead of issuing SQL.
   * Native backends implement this; SQL backends leave it unset.
   */
  evaluateProgram?(analyzed: TypedProgram, loaders: ExtensionalLoader[]): Promise<QueryResult[]>;
}
