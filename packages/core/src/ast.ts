// Re-export Langium-generated AST types as the canonical AST.
// The grammar and generated types live in datamog-parser; this module
// provides backward-compatible type aliases consumed by the rest of the codebase.

import type { NumberLiteral } from "datamog-parser";

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

/**
 * True if a NumberLiteral was written as a real (i.e. its source text contains
 * a decimal point or an exponent). Needed because the parser coerces NUMBER
 * tokens to JavaScript numbers, which collapses `1.0` and `1` to the same
 * value. The parser's post-processing preserves the original text on
 * `rawText` so we can recover the distinction here.
 */
export function isRealLiteral(n: NumberLiteral): boolean {
  const raw = (n as NumberLiteral & { rawText?: string }).rawText;
  return raw !== undefined && /[.eE]/.test(raw);
}
