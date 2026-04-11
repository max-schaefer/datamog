import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import { analyze } from "../src/analyzer.ts";

describe("analyzer", () => {
  test("classifies extensional predicates", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
    `);
    const result = analyze(program);
    expect(result.extDecls.has("parent")).toBe(true);
    expect(result.rules.has("ancestor")).toBe(true);
    expect(result.rules.has("parent")).toBe(false);
  });

  test("builds dependency graph", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `);
    const result = analyze(program);
    expect(result.dependencies.get("ancestor")).toEqual(new Set(["parent", "ancestor"]));
  });

  test("detects self-recursion", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `);
    const result = analyze(program);
    expect(result.recursivePredicates.has("ancestor")).toBe(true);
  });

  test("detects non-recursive predicates", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      grandparent(X, Y) :- parent(X, Z), parent(Z, Y).
    `);
    const result = analyze(program);
    expect(result.recursivePredicates.has("grandparent")).toBe(false);
  });

  test("errors on duplicate extensional declaration", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      extensional parent(name: text, child: text).
    `);
    expect(() => analyze(program)).toThrow(/multiple times/);
  });

  test("errors on arity mismatch between rules", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      related(X, Y) :- parent(X, Y).
      related(X) :- parent(X, "alice").
    `);
    expect(() => analyze(program)).toThrow(/arity/);
  });

  test("errors on arity mismatch in rule body", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      wrong(X) :- parent(X).
    `);
    expect(() => analyze(program)).toThrow(/arity 2 but is used with 1/);
  });

  test("errors on arity mismatch in query", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      ?- parent(X).
    `);
    expect(() => analyze(program)).toThrow(/arity 2 but is used with 1/);
  });

  test("errors on predicate that is both EDB and IDB", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      parent(X, Y) :- parent(X, Y).
    `);
    expect(() => analyze(program)).toThrow(/both extensional and intensional/);
  });

  test("topological sort produces valid order", () => {
    const program = parse(`
      extensional edge(src: text, dst: text).
      path(X, Y) :- edge(X, Y).
      path(X, Y) :- edge(X, Z), path(Z, Y).
      reachable(X) :- path("start", X).
    `);
    const result = analyze(program);
    const strata = result.sortedStrata;
    const pathIdx = strata.findIndex((s) => s.includes("path"));
    const reachableIdx = strata.findIndex((s) => s.includes("reachable"));
    expect(pathIdx).toBeLessThan(reachableIdx);
  });

  test("detects mutual recursion", () => {
    const program = parse(`
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
    `);
    const result = analyze(program);
    expect(result.recursivePredicates.has("even")).toBe(true);
    expect(result.recursivePredicates.has("odd")).toBe(true);
    // even and odd should be in the same stratum
    const stratum = result.sortedStrata.find((s) => s.includes("even"));
    expect(stratum).toContain("odd");
  });

  test("collects queries", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ?- ancestor("alice", X).
    `);
    const result = analyze(program);
    expect(result.queries).toHaveLength(1);
    expect(result.queries[0]?.atom.predicate).toBe("ancestor");
  });

  test("accepts stratified negation", () => {
    const program = parse(`
      extensional node(name: text).
      extensional edge(src: text, dst: text).
      reachable(X) :- edge("start", X).
      reachable(X) :- edge(Y, X), reachable(Y).
      unreachable(X) :- node(X), not reachable(X).
    `);
    const result = analyze(program);
    expect(result.rules.has("unreachable")).toBe(true);
    expect(result.negativeDependencies.get("unreachable")).toEqual(new Set(["reachable"]));
  });

  test("rejects unstratifiable negation", () => {
    const program = parse(`
      extensional base(x: text).
      foo(X) :- base(X), not bar(X).
      bar(X) :- base(X), not foo(X).
    `);
    expect(() => analyze(program)).toThrow(/not stratifiable/);
  });

  test("rejects self-negation", () => {
    const program = parse(`
      extensional base(x: text).
      foo(X) :- base(X), not foo(X).
    `);
    expect(() => analyze(program)).toThrow(/not stratifiable/);
  });

  test("rejects unsafe negation", () => {
    const program = parse(`
      extensional base(x: text).
      foo(X) :- base(X), not bar(X, Y).
    `);
    expect(() => analyze(program)).toThrow(/Unsafe variable 'Y'/);
  });

  test("accepts safe equality", () => {
    const program = parse(`
      extensional scores(name: text, score: integer).
      doubled(X, Y) :- scores(X, S), Y = S * 2.
    `);
    const result = analyze(program);
    expect(result.rules.has("doubled")).toBe(true);
  });

  test("rejects unsafe equality RHS variable", () => {
    const program = parse(`
      extensional base(x: integer).
      bad(X) :- base(X), Y = X + Z.
    `);
    expect(() => analyze(program)).toThrow(/Unsafe variable 'Z'/);
  });

  test("accepts chained equalities", () => {
    const program = parse(`
      extensional base(x: integer).
      chain(X, Z) :- base(X), Y = X + 1, Z = Y * 2.
    `);
    const result = analyze(program);
    expect(result.rules.has("chain")).toBe(true);
  });

  test("rejects unsafe head variable from expression", () => {
    const program = parse(`
      extensional base(x: integer).
      bad(X, Y) :- base(X).
    `);
    expect(() => analyze(program)).toThrow(/Unsafe variable 'Y'/);
  });

  test("accepts safe comparison", () => {
    const program = parse(`
      extensional scores(name: text, score: integer).
      high(X) :- scores(X, S), S > 80.
    `);
    const result = analyze(program);
    expect(result.rules.has("high")).toBe(true);
  });

  test("rejects unsafe variable in comparison", () => {
    const program = parse(`
      extensional base(x: integer).
      bad(X) :- base(X), Y > 10.
    `);
    expect(() => analyze(program)).toThrow(/Unsafe variable 'Y'/);
  });

  test("handles facts (rules with empty body)", () => {
    const program = parse(`
      base("hello").
      derived(X) :- base(X).
    `);
    const result = analyze(program);
    expect(result.rules.has("base")).toBe(true);
    expect(result.rules.get("base")).toHaveLength(1);
    expect(result.rules.get("base")?.[0]?.body).toHaveLength(0);
  });

  test("accepts range atom binding a variable", () => {
    const program = parse(`
      foo(X) :- X in [1 .. 10].
    `);
    const result = analyze(program);
    expect(result.rules.has("foo")).toBe(true);
  });

  test("accepts range atom with bound expression", () => {
    const program = parse(`
      extensional nums(x: integer).
      filtered(X) :- nums(X), X in [1 .. 100].
    `);
    const result = analyze(program);
    expect(result.rules.has("filtered")).toBe(true);
  });

  test("accepts range with expression bounds from safe variables", () => {
    const program = parse(`
      extensional base(x: integer, y: integer).
      inrange(X) :- base(X, Y), X in [Y .. Y + 10].
    `);
    const result = analyze(program);
    expect(result.rules.has("inrange")).toBe(true);
  });

  test("rejects range with unsafe variable in bounds", () => {
    const program = parse(`
      extensional base(x: integer).
      bad(X) :- base(X), X in [Y .. 10].
    `);
    expect(() => analyze(program)).toThrow(/Unsafe variable 'Y'/);
  });

  test("rejects range with unsafe non-variable expression", () => {
    const program = parse(`
      extensional base(x: integer).
      bad(X) :- base(X), Y + 1 in [1 .. 10].
    `);
    expect(() => analyze(program)).toThrow(/Unsafe variable 'Y'/);
  });

  test("accepts aggregate rule with count", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      num_children(P, count(C)) :- parent(P, C).
    `);
    const result = analyze(program);
    expect(result.rules.has("num_children")).toBe(true);
  });

  test("accepts aggregate rule with count(_)", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      total(count(_)) :- parent(_, _).
    `);
    const result = analyze(program);
    expect(result.rules.has("total")).toBe(true);
  });

  test("accepts aggregate rule with no grouping variables", () => {
    const program = parse(`
      extensional scores(name: text, score: integer).
      total_score(sum(S)) :- scores(_, S).
    `);
    const result = analyze(program);
    expect(result.rules.has("total_score")).toBe(true);
  });

  test("rejects mixed aggregate and non-aggregate rules", () => {
    const program = parse(`
      extensional parent(name: text, child: text).
      foo(P, count(C)) :- parent(P, C).
      foo("nobody", 0).
    `);
    expect(() => analyze(program)).toThrow(/both aggregate and non-aggregate/);
  });

  test("rejects aggregate embedded in expression", () => {
    const program = parse(`
      extensional scores(name: text, score: integer).
      bad(X, sum(S) + 1) :- scores(X, S).
    `);
    expect(() => analyze(program)).toThrow(/top-level head argument/);
  });

  test("rejects nested aggregates", () => {
    const program = parse(`
      extensional scores(name: text, score: integer).
      bad(X, count(sum(S))) :- scores(X, S).
    `);
    expect(() => analyze(program)).toThrow(/Nested aggregate/);
  });

  test("rejects recursive aggregate predicate", () => {
    const program = parse(`
      extensional edge(src: text, dst: text).
      cnt(X, count(Y)) :- edge(X, Y).
      cnt(X, count(Y)) :- cnt(X, Y).
    `);
    expect(() => analyze(program)).toThrow(/cannot be recursive/);
  });

  test("rejects rules disagreeing on aggregate positions", () => {
    const program = parse(`
      extensional t(a: integer, b: integer).
      foo(X, count(Y)) :- t(X, Y).
      foo(count(X), Y) :- t(X, Y).
    `);
    expect(() => analyze(program)).toThrow(/disagree on which head positions/);
  });

  test("accepts multiple aggregate rules for same predicate", () => {
    const program = parse(`
      extensional t1(a: text, b: integer).
      extensional t2(a: text, b: integer).
      totals(X, sum(Y)) :- t1(X, Y).
      totals(X, sum(Y)) :- t2(X, Y).
    `);
    const result = analyze(program);
    expect(result.rules.has("totals")).toBe(true);
  });
});
