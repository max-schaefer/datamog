import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import { analyze } from "../src/analyzer.ts";
import { findRecursiveCalls } from "../src/recursion.ts";

function findCalls(source: string) {
  const analyzed = analyze(parse(source));
  return findRecursiveCalls(analyzed).map((c) => ({
    predicate: c.predicate,
    string: source.slice(c.offset, c.end),
  }));
}

describe("findRecursiveCalls", () => {
  test("flags self-recursion", () => {
    const source = `
      input predicate parent(p: string, c: string).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `;
    expect(findCalls(source)).toEqual([{ predicate: "ancestor", string: "ancestor(Z, Y)" }]);
  });

  test("flags mutually recursive predicates", () => {
    // `even` and `odd` form one SCC; each calls the other.
    const source = `
      input predicate edge(s: string, d: string).
      even_path(X, Y) :- edge(X, Y).
      even_path(X, Y) :- odd_path(X, Z), edge(Z, Y).
      odd_path(X, Y) :- even_path(X, Z), edge(Z, Y).
    `;
    expect(findCalls(source).map((c) => c.predicate)).toEqual(["odd_path", "even_path"]);
  });

  test("does not flag calls into a lower stratum (non-recursive)", () => {
    // `summary` reads `ancestor` but is itself non-recursive — that
    // call is not a recursive call.
    const source = `
      input predicate parent(p: string, c: string).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
      summary(X) :- ancestor(X, _).
    `;
    expect(findCalls(source)).toEqual([{ predicate: "ancestor", string: "ancestor(Z, Y)" }]);
  });

  test("returns empty for non-recursive programs", () => {
    const source = `
      input predicate p(x: integer).
      doubled(X, Y) :- p(X), Y = X * 2.
    `;
    expect(findCalls(source)).toEqual([]);
  });

  test("does not flag negated atoms (stratification forbids same-SCC negation)", () => {
    // Verifies the function doesn't emit a span for `not q(X)` even
    // if q happened to be in the same SCC — though stratification
    // rejects that program upstream, the function should be defensive.
    const source = `
      input predicate base(x: string).
      live(X) :- base(X).
      dead(X) :- base(X), not live(X).
    `;
    expect(findCalls(source)).toEqual([]);
  });

  test("orders calls by source offset", () => {
    const source = `
      input predicate edge(s: string, d: string).
      reach(X, Y) :- edge(X, Y).
      reach(X, Y) :- reach(X, Z), edge(Z, W), reach(W, Y).
    `;
    const calls = findCalls(source);
    expect(calls.map((c) => c.string)).toEqual(["reach(X, Z)", "reach(W, Y)"]);
  });
});
