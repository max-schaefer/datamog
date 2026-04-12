import type { AnalyzedProgram, Rule } from "datamog-core";

/**
 * Interface for dialect-specific SQL generation.
 * Each SQL backend (Postgres, SQLite, etc.) implements this interface
 * to control how DDL and dialect-specific expressions are produced.
 */
export interface SqlDialect {
  readonly name: string;

  /** Wrap a UNION body into a CREATE VIEW for a non-recursive predicate. */
  createView(name: string, body: string): string;

  /** Wrap a UNION body into a CREATE VIEW for a self-recursive predicate. */
  createRecursiveView(name: string, columns: string, body: string): string;

  /**
   * Generate CREATE VIEW statements for a mutually recursive SCC (stratum).
   *
   * @param stratum - predicate names in the SCC
   * @param arities - arity of each predicate
   * @param rules - rules for each predicate
   * @param analyzed - the full analyzed program (for column resolution)
   * @param translateRule - callback to translate a single rule to a SQL SELECT;
   *   the dialect may pass renameMap/tagMap to control table references
   * @returns one CREATE VIEW string per predicate
   */
  createMutuallyRecursiveViews(
    stratum: string[],
    arities: ReadonlyMap<string, number>,
    rules: ReadonlyMap<string, Rule[]>,
    analyzed: AnalyzedProgram,
    translateRule: (
      rule: Rule,
      renameMap?: Map<string, string>,
      tagMap?: Map<string, string>,
    ) => string,
  ): string[];

  /** Generate a FROM clause element for a binding range (integer series). */
  rangeSource(alias: string, lowSql: string, highSql: string): string;

  /** Return additional WHERE conditions for a binding range (empty if not needed). */
  rangeConditions(alias: string, lowSql: string, highSql: string): string[];

  /** Generate SQL for the group_concat aggregate function. */
  groupConcat(argSql: string): string;
}

/** Quote an identifier. */
export function ident(name: string): string {
  return `"${name}"`;
}

/** Generate a comma-separated list of positional column names: col1, col2, ... */
export function colList(arity: number): string {
  return Array.from({ length: arity }, (_, i) => `col${i + 1}`).join(", ");
}
