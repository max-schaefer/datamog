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
    const pathIdx = result.sortedPredicates.indexOf("path");
    const reachableIdx = result.sortedPredicates.indexOf("reachable");
    expect(pathIdx).toBeLessThan(reachableIdx);
  });

  test("errors on mutual recursion", () => {
    const program = parse(`
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
    `);
    expect(() => analyze(program)).toThrow(/mutual recursion/i);
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
});
