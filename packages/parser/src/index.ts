export type {
  Atom,
  BinaryExpr,
  BinaryOp,
  BodyElement,
  ColumnDecl,
  Comparison,
  ComparisonOp,
  Equality,
  ExtDecl,
  NumberLiteral,
  Program,
  Query,
  Rule,
  SourceElement,
  SourcePosition,
  SqlType,
  Statement,
  StringLiteral,
  Term,
  UnaryExpr,
  Variable,
} from "datamog-core";
export { ParseError } from "./errors.ts";
export { type Token, TokenType, tokenize } from "./lexer.ts";
export { Parser } from "./parser.ts";

import type { Program } from "datamog-core";
import { tokenize } from "./lexer.ts";
import { Parser } from "./parser.ts";

export function parse(source: string): Program {
  const tokens = tokenize(source);
  return new Parser(tokens).parse();
}
