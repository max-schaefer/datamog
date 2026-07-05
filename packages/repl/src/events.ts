import type { PrimitiveType } from "datamog-core";

/** Phase the error originated in. Used for both human and JSON-mode rendering. */
export type ErrorPhase = "parse" | "analyze" | "execute" | "command";

export type ReplEvent =
  | DeclaredEvent
  | RuleEvent
  | ResultEvent
  | InfoEvent
  | SchemaEvent
  | SqlEvent
  | ErrorEvent
  | DoneEvent;

export interface DeclaredEvent {
  kind: "declared";
  predicate: string;
  arity: number;
  /** Number of EDB rows the loader inserted; `undefined` for native backends
   *  that don't surface a count. */
  rowsLoaded: number | undefined;
}

export interface RuleEvent {
  kind: "rule";
  predicate: string;
  arity: number;
}

export interface ResultEvent {
  kind: "result";
  /** Result-row column names in declaration order. Empty for `?- p(*).`-style
   *  queries that select all of a predicate's columns under their EDB names. */
  columns: string[];
  /** Per-column declared `PrimitiveType`. Same length as `columns`; entries are
   *  `undefined` when the translator skipped type inference for the column. */
  types: (PrimitiveType | undefined)[];
  rows: Record<string, unknown>[];
  /** Generated SQL (empty string for native backends). */
  sql: string;
  /** Original Datalog source text for the query. */
  source: string | undefined;
}

export interface InfoEvent {
  kind: "info";
  message: string;
}

export interface SchemaEvent {
  kind: "schema";
  predicates: SchemaPredicate[];
}

export interface SchemaPredicate {
  name: string;
  predicateKind: "edb" | "idb";
  columns: { name: string; type: PrimitiveType | undefined }[];
}

export interface SqlEvent {
  kind: "sql";
  sql: string;
}

export interface ErrorEvent {
  kind: "error";
  phase: ErrorPhase;
  message: string;
  /** 1-based line within the chunk (or command argument), if known. */
  line?: number;
  /** 1-based column within the chunk (or command argument), if known. */
  column?: number;
}

export interface DoneEvent {
  kind: "done";
}
