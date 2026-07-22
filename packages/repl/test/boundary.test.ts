import { describe, expect, test } from "bun:test";
import { isFastCommitChunk, isInputComplete, offsetToLineColumn } from "../src/boundary.ts";

describe("isInputComplete", () => {
  test("empty buffer is incomplete", () => {
    expect(isInputComplete("")).toBe(false);
    expect(isInputComplete("   \n  ")).toBe(false);
  });

  test("simple statement terminated by '.' is complete", () => {
    expect(isInputComplete("p(X) :- q(X).")).toBe(true);
    expect(isInputComplete("?- p(X).\n")).toBe(true);
  });

  test("missing terminator is incomplete", () => {
    expect(isInputComplete("p(X) :- q(X)")).toBe(false);
  });

  test("multi-line statement waits for terminator", () => {
    expect(isInputComplete("p(X) :-\n  q(X)")).toBe(false);
    expect(isInputComplete("p(X) :-\n  q(X).")).toBe(true);
  });

  test("dot inside a numeric literal does not terminate", () => {
    expect(isInputComplete("?- p(1.5)")).toBe(false);
    expect(isInputComplete("?- p(1.5).")).toBe(true);
  });

  test("dot inside a string literal does not terminate", () => {
    expect(isInputComplete('?- p("a.b")')).toBe(false);
    expect(isInputComplete('?- p("a.b").')).toBe(true);
  });

  test("dot inside a quoted ident does not terminate", () => {
    expect(isInputComplete("?- p(`a.b`)")).toBe(false);
    expect(isInputComplete("?- p(`a.b`).")).toBe(true);
  });

  test("dot inside a comment does not terminate", () => {
    expect(isInputComplete("# p(X). a comment")).toBe(false);
    expect(isInputComplete("# p(X). a comment\np(1).")).toBe(true);
  });

  test("unbalanced parens are incomplete despite a dot", () => {
    expect(isInputComplete("?- p(1, 2.")).toBe(false);
    expect(isInputComplete("?- p((1, 2).")).toBe(false);
  });

  test("nested object literal stays incomplete until braces close", () => {
    expect(isInputComplete('?- p({"a": 1.')).toBe(false);
    expect(isInputComplete('?- p({"a": 1}).')).toBe(true);
  });

  test("escape inside a string skips the next character", () => {
    // The closing `"` after the escape sequence is the actual end.
    expect(isInputComplete('?- p("\\".").')).toBe(true);
  });
});

describe("isFastCommitChunk", () => {
  test("query buffer starting with ?- fast-commits", () => {
    expect(isFastCommitChunk("?- p(X).")).toBe(true);
    expect(isFastCommitChunk("?- ancestor(X,\n   Y).")).toBe(true);
  });

  test("input predicate declaration fast-commits", () => {
    expect(isFastCommitChunk("input predicate p(x: integer).")).toBe(true);
    expect(isFastCommitChunk("input predicate p(\n  x: integer\n).")).toBe(true);
    // `input(...)` is a predicate atom named `input` (a fact), not a
    // declaration, so it accumulates like any other fact.
    expect(isFastCommitChunk("input(p, x).")).toBe(false);
  });

  test("rules do not fast-commit", () => {
    expect(isFastCommitChunk("p(X) :- q(X).")).toBe(false);
    expect(isFastCommitChunk("ancestor(X, Y) :- parent(X, Y).")).toBe(false);
  });

  test("identifiers that share a prefix with `input` do not match", () => {
    // A predicate named `inputs` starts with the keyword `input` but is an
    // ordinary identifier, so the check must require a keyword boundary and
    // not fast-commit it.
    expect(isFastCommitChunk("inputs(X).")).toBe(false);
  });

  test("leading whitespace is skipped", () => {
    expect(isFastCommitChunk("  \n  ?- p(X).")).toBe(true);
    expect(isFastCommitChunk("\n\n  input predicate p(x: integer).")).toBe(true);
  });

  test("leading comments are skipped", () => {
    expect(isFastCommitChunk("# describe what this does\n?- p(X).")).toBe(true);
    expect(
      isFastCommitChunk("# the parent table\ninput predicate parent(p: string, c: string)."),
    ).toBe(true);
  });

  test("rule following a comment does not fast-commit", () => {
    expect(isFastCommitChunk("# a comment\np(X) :- q(X).")).toBe(false);
  });

  test("empty / whitespace-only buffer does not fast-commit", () => {
    expect(isFastCommitChunk("")).toBe(false);
    expect(isFastCommitChunk("   \n  ")).toBe(false);
    expect(isFastCommitChunk("# only a comment\n")).toBe(false);
  });
});

describe("offsetToLineColumn", () => {
  test("offset 0 is line 1, column 1", () => {
    expect(offsetToLineColumn("abc\ndef", 0)).toEqual({ line: 1, column: 1 });
  });

  test("offset on second line", () => {
    // "abc\n" is offsets 0..3, newline at 3, "d" at 4
    expect(offsetToLineColumn("abc\ndef", 4)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineColumn("abc\ndef", 5)).toEqual({ line: 2, column: 2 });
  });

  test("offset past end returns last reachable position", () => {
    // The implementation walks min(offset, length) characters; for offsets
    // past the end the result is the line of the last character plus the
    // distance into that line.
    const r = offsetToLineColumn("abc", 100);
    expect(r.line).toBe(1);
  });
});
