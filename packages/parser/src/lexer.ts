import type { SourcePosition } from "datamog-core";
import { ParseError } from "./errors.ts";

export enum TokenType {
  Ident = 0,
  Variable = 1,
  String = 2,
  Number = 3,

  Extensional = 4,
  TextType = 5,
  IntegerType = 6,
  RealType = 7,
  BooleanType = 8,

  LParen = 9,
  RParen = 10,
  LBracket = 11,
  RBracket = 12,
  Comma = 13,
  Dot = 14,
  Colon = 15,
  Turnstile = 16,
  QueryMark = 17,

  Not = 19,

  Plus = 21,
  Minus = 22,
  Star = 23,
  Slash = 24,
  Percent = 25,
  Equals = 26,
  Lt = 27,
  Gt = 28,
  LtEq = 29,
  GtEq = 30,
  NotEq = 31,

  EOF = 40,
}

export interface Token {
  type: TokenType;
  value: string;
  span: SourcePosition;
}

const KEYWORDS: Record<string, TokenType> = {
  extensional: TokenType.Extensional,
  mod: TokenType.Percent,
  not: TokenType.Not,
  text: TokenType.TextType,
  integer: TokenType.IntegerType,
  real: TokenType.RealType,
  boolean: TokenType.BooleanType,
};

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlphaNum(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

function isUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let column = 1;

  function span(start: number, startLine: number, startCol: number): SourcePosition {
    return { start, end: pos, line: startLine, column: startCol };
  }

  function peek(): string {
    return source[pos] ?? "";
  }

  function advance(): string {
    const ch = source[pos]!;
    pos++;
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  while (pos < source.length) {
    const ch = peek();

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    // Comments
    if (ch === "%") {
      while (pos < source.length && peek() !== "\n") advance();
      continue;
    }

    const startPos = pos;
    const startLine = line;
    const startCol = column;

    // Two-character operators
    if (ch === ":" && source[pos + 1] === "-") {
      pos += 2;
      column += 2;
      tokens.push({
        type: TokenType.Turnstile,
        value: ":-",
        span: span(startPos, startLine, startCol),
      });
      continue;
    }
    if (ch === "?" && source[pos + 1] === "-") {
      pos += 2;
      column += 2;
      tokens.push({
        type: TokenType.QueryMark,
        value: "?-",
        span: span(startPos, startLine, startCol),
      });
      continue;
    }
    if (ch === "<" && source[pos + 1] === "=") {
      pos += 2;
      column += 2;
      tokens.push({ type: TokenType.LtEq, value: "<=", span: span(startPos, startLine, startCol) });
      continue;
    }
    if (ch === ">" && source[pos + 1] === "=") {
      pos += 2;
      column += 2;
      tokens.push({ type: TokenType.GtEq, value: ">=", span: span(startPos, startLine, startCol) });
      continue;
    }
    if (ch === "!" && source[pos + 1] === "=") {
      pos += 2;
      column += 2;
      tokens.push({
        type: TokenType.NotEq,
        value: "!=",
        span: span(startPos, startLine, startCol),
      });
      continue;
    }

    // Single-character punctuation
    const punctMap: Record<string, TokenType> = {
      "(": TokenType.LParen,
      ")": TokenType.RParen,
      "[": TokenType.LBracket,
      "]": TokenType.RBracket,
      ",": TokenType.Comma,
      ".": TokenType.Dot,
      ":": TokenType.Colon,
      "+": TokenType.Plus,
      "-": TokenType.Minus,
      "*": TokenType.Star,
      "/": TokenType.Slash,
      "=": TokenType.Equals,
      "<": TokenType.Lt,
      ">": TokenType.Gt,
    };
    if (punctMap[ch] !== undefined) {
      advance();
      tokens.push({ type: punctMap[ch]!, value: ch, span: span(startPos, startLine, startCol) });
      continue;
    }

    // String literals
    if (ch === '"') {
      advance(); // opening quote
      let value = "";
      while (pos < source.length && peek() !== '"') {
        if (peek() === "\\") {
          advance();
          const escaped = advance();
          if (escaped === '"') value += '"';
          else if (escaped === "\\") value += "\\";
          else if (escaped === "n") value += "\n";
          else if (escaped === "t") value += "\t";
          else value += escaped;
        } else {
          value += advance();
        }
      }
      if (pos >= source.length) {
        throw new ParseError("Unterminated string literal", span(startPos, startLine, startCol));
      }
      advance(); // closing quote
      tokens.push({ type: TokenType.String, value, span: span(startPos, startLine, startCol) });
      continue;
    }

    // Number literals
    if (isDigit(ch)) {
      let value = "";
      while (pos < source.length && isDigit(peek())) value += advance();
      if (pos < source.length && peek() === "." && isDigit(source[pos + 1] ?? "")) {
        value += advance(); // dot
        while (pos < source.length && isDigit(peek())) value += advance();
      }
      tokens.push({ type: TokenType.Number, value, span: span(startPos, startLine, startCol) });
      continue;
    }

    // Identifiers, variables, and type keywords
    if (isAlpha(ch)) {
      let value = "";
      while (pos < source.length && isAlphaNum(peek())) value += advance();

      const kw = KEYWORDS[value];
      if (kw !== undefined) {
        tokens.push({ type: kw, value, span: span(startPos, startLine, startCol) });
      } else if (isUpper(value[0]!) || value === "_") {
        tokens.push({ type: TokenType.Variable, value, span: span(startPos, startLine, startCol) });
      } else {
        tokens.push({ type: TokenType.Ident, value, span: span(startPos, startLine, startCol) });
      }
      continue;
    }

    throw new ParseError(`Unexpected character '${ch}'`, span(startPos, startLine, startCol));
  }

  tokens.push({
    type: TokenType.EOF,
    value: "",
    span: { start: pos, end: pos, line, column },
  });

  return tokens;
}
