export type {
  Atom,
  ColumnDecl,
  ExtDecl,
  NumberLiteral,
  Program,
  Query,
  Rule,
  Span,
  SqlType,
  Statement,
  StringLiteral,
  Term,
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
