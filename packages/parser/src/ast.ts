export interface Span {
  start: number;
  end: number;
  line: number;
  column: number;
}

// --- Terms ---

export interface Variable {
  kind: "variable";
  name: string;
  span: Span;
}

export interface StringLiteral {
  kind: "string";
  value: string;
  span: Span;
}

export interface NumberLiteral {
  kind: "number";
  value: number;
  span: Span;
}

export type Term = Variable | StringLiteral | NumberLiteral;

// --- Column declarations (for extensional predicates) ---

export type SqlType = "text" | "integer" | "real" | "boolean";

export interface ColumnDecl {
  name: string;
  type: SqlType;
}

// --- Atoms ---

export interface Atom {
  kind: "atom";
  predicate: string;
  args: Term[];
  span: Span;
}

// --- Statements ---

export interface ExtDecl {
  kind: "ext_decl";
  predicate: string;
  columns: ColumnDecl[];
  span: Span;
}

export interface Rule {
  kind: "rule";
  head: Atom;
  body: Atom[];
  span: Span;
}

export interface Query {
  kind: "query";
  atom: Atom;
  span: Span;
}

export type Statement = ExtDecl | Rule | Query;

// --- Program ---

export interface Program {
  statements: Statement[];
}
