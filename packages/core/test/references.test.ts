import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import { analyze } from "../src/analyzer.ts";
import { findPredicateReferences } from "../src/references.ts";

function refsOf(source: string) {
  const analyzed = analyze(parse(source));
  return findPredicateReferences(analyzed).map((r) => ({
    name: r.predicate,
    span: source.slice(r.offset, r.end),
    target: source.slice(r.definitionOffset, r.definitionOffset + r.predicate.length),
  }));
}

describe("findPredicateReferences", () => {
  test("body atom references jump to input predicate declaration", () => {
    const source = "input predicate p(x: integer).\nq(X) :- p(X).";
    expect(refsOf(source)).toEqual([{ name: "p", span: "p", target: "p" }]);
  });

  test("query atom references count too", () => {
    const source = "input predicate p(x: integer).\n?- p(X).";
    expect(refsOf(source)).toEqual([{ name: "p", span: "p", target: "p" }]);
  });

  test("references to an IDB jump to its first rule head", () => {
    const source = `
      input predicate edge(s: string, d: string).
      reach(X, Y) :- edge(X, Y).
      reach(X, Y) :- edge(X, Z), reach(Z, Y).
      ?- reach(X, Y).
    `;
    const refs = refsOf(source);
    // 4 body-atom references (3 inside rules: edge, edge, reach) and
    // 1 in the query.
    expect(refs.map((r) => r.name)).toEqual(["edge", "edge", "reach", "reach"]);
    // every `reach` reference targets `reach` — the IDENT at the
    // first rule head's offset.
    for (const r of refs.filter((x) => x.name === "reach")) {
      expect(r.target).toBe("reach");
    }
  });

  test("negated atom references emit a span at the predicate name, not the `not` keyword", () => {
    // Regression: the predicate-name span must skip past `not` and
    // any whitespace, otherwise Cmd+click on `bar` would land
    // outside the link region (or on `not` itself).
    const source = `
      input predicate foo(x: string).
      input predicate bar(x: string).
      r(X) :- foo(X), not bar(X).
    `;
    const refs = refsOf(source);
    const negated = refs.find((r) => r.name === "bar");
    expect(negated).toBeDefined();
    expect(negated!.span).toBe("bar");
  });

  test("rule head and input predicate declaration are not references", () => {
    // The predicate name in a rule head (`reach(X, Y) :- …`) and in
    // an `extensional` declaration is the *target* of jump-to-def,
    // not a reference. We don't want clicking a head to jump to
    // itself, so they must not appear in the reference list.
    const source = `
      input predicate edge(s: string, d: string).
      reach(X, Y) :- edge(X, Y).
    `;
    const refs = refsOf(source);
    // Only `edge` in the body is a reference; `reach` (head) and
    // `edge` (input predicate decl) aren't.
    expect(refs).toHaveLength(1);
    expect(refs[0]!.name).toBe("edge");
  });

  test("references are returned in source order", () => {
    const source = `
      input predicate a(x: integer).
      input predicate b(x: integer).
      r(X) :- b(X), a(X).
      ?- a(X).
    `;
    const refs = refsOf(source);
    expect(refs.map((r) => r.name)).toEqual(["b", "a", "a"]);
  });
});
