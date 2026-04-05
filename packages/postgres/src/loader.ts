import type { ExtDecl } from "datamog-core";

export interface LoadResult {
  rowsLoaded: number;
}

export interface ExtensionalLoader {
  readonly name: string;

  /** Returns true if this loader can handle the given extensional declaration. */
  canLoad(decl: ExtDecl): Promise<boolean>;

  /**
   * Load data into the table for the given declaration.
   * The table has already been created. The loader should INSERT rows.
   * @param decl The extensional declaration describing the table schema.
   * @param sql A Bun SQL connection to execute queries against.
   */
  load(decl: ExtDecl, sql: BunSQL): Promise<LoadResult>;
}

/** The type of a Bun SQL connection (from `Bun.sql` or `new Bun.SQL()`). */
export type BunSQL = {
  // Tagged template for queries
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  // Identifier escaping
  unsafe(query: string, values?: unknown[]): Promise<unknown[]>;
};
