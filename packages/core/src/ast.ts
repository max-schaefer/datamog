// Re-export Langium-generated AST types as the canonical AST.
// The grammar and generated types live in datamog-parser; this module
// provides backward-compatible type aliases consumed by the rest of the codebase.

export type {
  AggregateCall,
  Atom,
  BinaryExpr,
  BodyElement,
  ColumnDecl,
  Comparison,
  ComparisonOp,
  Expression,
  ExtDecl,
  FunctionCall,
  HeadAtom,
  HeadTerm,
  NumberLiteral,
  Program,
  Query,
  RangeAtom,
  Rule,
  Slice,
  SqlType,
  Statement,
  StringLiteral,
  Subscript,
  UnaryExpr,
  Variable,
} from "datamog-parser";

export type { AggregateFunction, BinaryOp } from "datamog-parser";

// Alias: the old AST called the expression union "Term"
export type { Expression as Term } from "datamog-parser";

export type ComparisonOp_Alias = "<" | ">" | "<=" | ">=" | "!=";
