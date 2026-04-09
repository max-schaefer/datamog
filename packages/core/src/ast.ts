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

// --- Expressions (terms) ---

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

export type BinaryOp = "+" | "-" | "*" | "/" | "%";

export interface BinaryExpr extends SourceElement {
  kind: "binary";
  op: BinaryOp;
  left: Term;
  right: Term;
}

export interface UnaryExpr extends SourceElement {
  kind: "unary";
  op: "-";
  operand: Term;
}

export type Term = Variable | StringLiteral | NumberLiteral | BinaryExpr | UnaryExpr;

// --- Column declarations (for extensional predicates) ---

export type SqlType = "text" | "integer" | "real" | "boolean";

export interface ColumnDecl {
  name: string;
  type: SqlType;
}

// --- Body elements ---

export interface Atom extends SourceElement {
  kind: "atom";
  predicate: string;
  args: Term[];
  negated?: boolean;
}

export interface Equality extends SourceElement {
  kind: "equality";
  variable: string;
  expr: Term;
}

export type BodyElement = Atom | Equality;

// --- Statements ---

export interface ExtDecl extends SourceElement {
  kind: "ext_decl";
  predicate: string;
  columns: ColumnDecl[];
}

export interface Rule extends SourceElement {
  kind: "rule";
  head: Atom;
  body: BodyElement[];
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
