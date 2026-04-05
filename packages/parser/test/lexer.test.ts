import { describe, expect, test } from "bun:test";
import { TokenType, tokenize } from "../src/lexer.ts";

function types(source: string): TokenType[] {
  return tokenize(source)
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.type);
}

function values(source: string): string[] {
  return tokenize(source)
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.value);
}

describe("lexer", () => {
  test("identifiers and variables", () => {
    expect(types("parent X foo Bar")).toEqual([
      TokenType.Ident,
      TokenType.Variable,
      TokenType.Ident,
      TokenType.Variable,
    ]);
    expect(values("parent X foo Bar")).toEqual(["parent", "X", "foo", "Bar"]);
  });

  test("string literals", () => {
    expect(types('"hello"')).toEqual([TokenType.String]);
    expect(values('"hello"')).toEqual(["hello"]);
  });

  test("string literals with escape", () => {
    expect(values('"say \\"hi\\""')).toEqual(['say "hi"']);
  });

  test("number literals", () => {
    expect(types("42 3.14")).toEqual([TokenType.Number, TokenType.Number]);
    expect(values("42 3.14")).toEqual(["42", "3.14"]);
  });

  test("extensional keyword", () => {
    expect(types("extensional")).toEqual([TokenType.Extensional]);
  });

  test("turnstile and query mark", () => {
    expect(types(":-")).toEqual([TokenType.Turnstile]);
    expect(types("?-")).toEqual([TokenType.QueryMark]);
  });

  test("punctuation", () => {
    expect(types("()[],:. ")).toEqual([
      TokenType.LParen,
      TokenType.RParen,
      TokenType.LBracket,
      TokenType.RBracket,
      TokenType.Comma,
      TokenType.Colon,
      TokenType.Dot,
    ]);
  });

  test("type keywords", () => {
    expect(types("text integer real boolean")).toEqual([
      TokenType.TextType,
      TokenType.IntegerType,
      TokenType.RealType,
      TokenType.BooleanType,
    ]);
  });

  test("comments are skipped", () => {
    expect(types("foo % this is a comment\nbar")).toEqual([TokenType.Ident, TokenType.Ident]);
    expect(values("foo % this is a comment\nbar")).toEqual(["foo", "bar"]);
  });

  test("ext declaration tokens", () => {
    expect(types("extensional parent(name: text, child: text).")).toEqual([
      TokenType.Extensional,
      TokenType.Ident,
      TokenType.LParen,
      TokenType.Ident,
      TokenType.Colon,
      TokenType.TextType,
      TokenType.Comma,
      TokenType.Ident,
      TokenType.Colon,
      TokenType.TextType,
      TokenType.RParen,
      TokenType.Dot,
    ]);
  });

  test("rule tokens", () => {
    expect(types("ancestor(X, Y) :- parent(X, Y).")).toEqual([
      TokenType.Ident,
      TokenType.LParen,
      TokenType.Variable,
      TokenType.Comma,
      TokenType.Variable,
      TokenType.RParen,
      TokenType.Turnstile,
      TokenType.Ident,
      TokenType.LParen,
      TokenType.Variable,
      TokenType.Comma,
      TokenType.Variable,
      TokenType.RParen,
      TokenType.Dot,
    ]);
  });

  test("query tokens", () => {
    expect(types('?- ancestor("alice", X).')).toEqual([
      TokenType.QueryMark,
      TokenType.Ident,
      TokenType.LParen,
      TokenType.String,
      TokenType.Comma,
      TokenType.Variable,
      TokenType.RParen,
      TokenType.Dot,
    ]);
  });

  test("span tracking", () => {
    const tokens = tokenize("foo");
    expect(tokens[0]?.span).toEqual({ start: 0, end: 3, line: 1, column: 1 });
  });

  test("span tracking across lines", () => {
    const tokens = tokenize("foo\nbar");
    expect(tokens[1]?.span.line).toBe(2);
    expect(tokens[1]?.span.column).toBe(1);
  });

  test("unterminated string throws", () => {
    expect(() => tokenize('"hello')).toThrow();
  });

  test("unexpected character throws", () => {
    expect(() => tokenize("@")).toThrow();
  });
});
