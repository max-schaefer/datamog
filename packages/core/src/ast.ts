export interface SourcePosition {
  /** 0-based byte offset of the first character in the source string. */
  start: number;
  /** 0-based byte offset one past the last character (exclusive). */
  end: number;
  /** 1-based line number of the first character. */
  line: number;
  /** 1-based column number of the first character. */
  column: number;
}

export interface SourceElement {
  span: SourcePosition;
}

// --- Terms ---

export interface Variable extends SourceElement {
  kind: "variable";
  name: string;
}

export interface StringLiteral extends SourceElement {
  kind: "string";
  value: string;
}

export interface NumberLiteral extends SourceElement {
  kind: "number";
  value: number;
}

export type Term = Variable | StringLiteral | NumberLiteral;

// --- Column declarations (for extensional predicates) ---

export type SqlType = "text" | "integer" | "real" | "boolean";

export interface ColumnDecl {
  name: string;
  type: SqlType;
}

// --- Atoms ---

export interface Atom extends SourceElement {
  kind: "atom";
  predicate: string;
  args: Term[];
}

// --- Statements ---

export interface ExtDecl extends SourceElement {
  kind: "ext_decl";
  predicate: string;
  columns: ColumnDecl[];
}

export interface Rule extends SourceElement {
  kind: "rule";
  head: Atom;
  body: Atom[];
}

export interface Query extends SourceElement {
  kind: "query";
  atom: Atom;
}

export type Statement = ExtDecl | Rule | Query;

// --- Program ---

export interface Program {
  statements: Statement[];
}
