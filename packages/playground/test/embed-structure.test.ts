import { describe, expect, test } from "bun:test";
import { parseStructure } from "../src/embed/structure.ts";

const PROGRAM = `extensional edge(src: string, dst: string).
extensional node(id: integer).

reachable(X) :- edge("a", X).

?- reachable(X).
?- node(N).`;

describe("parseStructure", () => {
  test("locates extensionals with predicate, columns, and span", () => {
    const { extensionals } = parseStructure(PROGRAM);
    expect(extensionals.map((e) => e.predicate)).toEqual(["edge", "node"]);
    expect(extensionals[0]!.columns).toEqual(["src", "dst"]);
    // Span should cover the declaration text.
    expect(PROGRAM.slice(extensionals[0]!.from, extensionals[0]!.to)).toContain("extensional edge");
  });

  test("indexes queries in source order", () => {
    const { queries } = parseStructure(PROGRAM);
    expect(queries.map((q) => q.index)).toEqual([0, 1]);
    expect(PROGRAM.slice(queries[0]!.from, queries[0]!.to)).toContain("reachable(X)");
    expect(PROGRAM.slice(queries[1]!.from, queries[1]!.to)).toContain("node(N)");
  });

  test("tolerates incomplete source", () => {
    const s = parseStructure("extensional edge(");
    expect(s.queries).toEqual([]);
    // A half-typed declaration may or may not yield a span; it must not throw.
    expect(Array.isArray(s.extensionals)).toBe(true);
  });
});
