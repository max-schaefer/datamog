import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import { analyze } from "../src/analyzer.ts";
import { inferTypes } from "../src/types.ts";

function getTypes(source: string) {
  const program = parse(source);
  const analyzed = analyze(program);
  return inferTypes(analyzed);
}

describe("type inference", () => {
  test("EDB types come from declarations", () => {
    const typed = getTypes("extensional t(a: text, b: integer, c: real, d: boolean).");
    expect(typed.columnTypes.get("t")).toEqual(["text", "integer", "real", "boolean"]);
  });

  test("IDB inherits types from EDB via variable binding", () => {
    const typed = getTypes(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
    `);
    expect(typed.columnTypes.get("ancestor")).toEqual(["text", "text"]);
  });

  test("IDB inherits integer type", () => {
    const typed = getTypes(`
      extensional scores(name: text, score: integer).
      high(X, S) :- scores(X, S), S > 80.
    `);
    expect(typed.columnTypes.get("high")).toEqual(["text", "integer"]);
  });

  test("arithmetic expression produces integer", () => {
    const typed = getTypes(`
      extensional base(x: integer).
      doubled(X, D) :- base(X), D = X * 2.
    `);
    expect(typed.columnTypes.get("doubled")).toEqual(["integer", "integer"]);
  });

  test("arithmetic with real promotes to real", () => {
    const typed = getTypes(`
      extensional base(x: integer).
      halved(X, H) :- base(X), H = X / 2.5.
    `);
    expect(typed.columnTypes.get("halved")![1]).toBe("real");
  });

  test("string literal in head produces text", () => {
    const typed = getTypes(`
      extensional items(name: text).
      tagged(X, "yes") :- items(X).
    `);
    expect(typed.columnTypes.get("tagged")).toEqual(["text", "text"]);
  });

  test("+ with string operand infers text (concatenation)", () => {
    const typed = getTypes(`
      extensional words(w: text).
      prefixed(R) :- words(W), R = "hello_" + W.
    `);
    expect(typed.columnTypes.get("prefixed")).toEqual(["text"]);
  });

  test("chained IDB type propagation", () => {
    const typed = getTypes(`
      extensional base(x: integer).
      step1(X, Y) :- base(X), Y = X + 1.
      step2(A, B) :- step1(A, B).
    `);
    expect(typed.columnTypes.get("step1")).toEqual(["integer", "integer"]);
    expect(typed.columnTypes.get("step2")).toEqual(["integer", "integer"]);
  });

  test("recursive predicate types converge", () => {
    const typed = getTypes(`
      extensional edge(src: text, dst: text).
      path(X, Y) :- edge(X, Y).
      path(X, Y) :- edge(X, Z), path(Z, Y).
    `);
    expect(typed.columnTypes.get("path")).toEqual(["text", "text"]);
  });

  test("multiple rules join types", () => {
    const typed = getTypes(`
      extensional a(x: integer).
      extensional b(x: real).
      combined(X) :- a(X).
      combined(X) :- b(X).
    `);
    // integer joined with real → real
    expect(typed.columnTypes.get("combined")).toEqual(["real"]);
  });

  test("fact with number literal", () => {
    const typed = getTypes('base(42, "hello").');
    expect(typed.columnTypes.get("base")).toEqual(["integer", "text"]);
  });

  test("range-bound variable has integer type", () => {
    const typed = getTypes(`
      nums(X) :- X in [1 .. 10].
    `);
    expect(typed.columnTypes.get("nums")).toEqual(["integer"]);
  });

  test("rejects range with non-numeric bounds", () => {
    expect(() =>
      getTypes(`
        extensional words(w: text).
        bad(X) :- words(X), X in ["a" .. "z"].
      `),
    ).toThrow(/non-numeric type/);
  });

  test("range variable with real bounds infers real type", () => {
    const typed = getTypes(`
      extensional base(x: real).
      ranged(X, Y) :- base(X), Y in [X .. X + 1.0].
    `);
    // Y gets real type from bounds (not integer, so not a binding range)
    expect(typed.columnTypes.get("ranged")).toEqual(["real", "real"]);
  });

  test("accepts range filter with real expression", () => {
    const typed = getTypes(`
      extensional vals(x: real).
      filtered(X) :- vals(X), X in [0 .. 100].
    `);
    expect(typed.columnTypes.get("filtered")).toEqual(["real"]);
  });
});
