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
  DatamogAstType,
} from "./generated/ast.js";

export {
  isAggregateCall,
  isAtom,
  isBinaryExpr,
  isBodyElement,
  isComparison,
  isEquality,
  isExpression,
  isExtDecl,
  isFunctionCall,
  isNumberLiteral,
  isQuery,
  isRangeAtom,
  isRule,
  isSlice,
  isStringLiteral,
  isSubscript,
  isUnaryExpr,
  isVariable,
} from "./generated/ast.js";

export type AggregateFunction = "count" | "sum" | "avg" | "min" | "max" | "group_concat";

export type BinaryOp = "+" | "-" | "*" | "/" | "%";

export { postProcess } from "./post-process.js";
export { createDatamogServices } from "./datamog-module.js";
export {
  DatamogGeneratedModule,
  DatamogGeneratedSharedModule,
} from "./generated/module.js";

import { createDatamogServices } from "./datamog-module.js";
import type { Program } from "./generated/ast.js";
import { postProcess } from "./post-process.js";

export class ParseError extends Error {
  line: number;
  column: number;

  constructor(message: string, line: number, column: number) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = "ParseError";
    this.line = line;
    this.column = column;
  }
}

const services = createDatamogServices();
const parser = services.Datamog.parser.LangiumParser;

export function parse(source: string): Program {
  const result = parser.parse<Program>(source);
  if (result.lexerErrors.length > 0) {
    const err = result.lexerErrors[0]!;
    throw new ParseError(err.message, err.line ?? 1, err.column ?? 1);
  }
  if (result.parserErrors.length > 0) {
    const err = result.parserErrors[0]!;
    throw new ParseError(err.message, err.token.startLine ?? 1, err.token.startColumn ?? 1);
  }
  const program = result.value;
  postProcess(program);
  return program;
}
