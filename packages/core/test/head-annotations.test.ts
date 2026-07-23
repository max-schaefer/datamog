import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import { AnalyzerError, analyze } from "../src/analyzer.ts";
import { inferTypes } from "../src/types.ts";

// Optional but checked head type annotations on intensional predicates
// (`h(x: integer)`). The annotation is lifted onto the head's `argTypes` during
// parsing, then checked against inference: all-or-nothing per predicate, all
// rules agree, and each declared type must equal or widen the inferred one.

function check(source: string) {
  const program = parse(source);
  const analyzed = analyze(program);
  return inferTypes(analyzed);
}

describe("head type annotations", () => {
  test("parsing lifts annotations onto head.argTypes and unwraps the term", () => {
    const program = parse('p("a": string, 2: integer).');
    const rule = program.statements[0] as {
      head: { args: { $type: string }[]; argTypes?: (string | undefined)[] };
    };
    expect(rule.head.argTypes).toEqual(["string", "integer"]);
    // The wrapper is gone: the args are ordinary terms again.
    expect(rule.head.args[0]!.$type).toBe("StringLiteral");
    expect(rule.head.args[1]!.$type).toBe("NumberLiteral");
  });

  test("no annotations leaves argTypes absent", () => {
    const program = parse("p(1, 2).");
    const rule = program.statements[0] as { head: { argTypes?: unknown } };
    expect(rule.head.argTypes).toBeUndefined();
  });

  test("correct annotations pass and do not change inferred types", () => {
    const typed = check(`
      input predicate edge(a: integer, b: integer).
      reach(x: integer, y: integer) :- edge(x, y).
      reach(x: integer, z: integer) :- reach(x, y), edge(y, z).
    `);
    expect(typed.columnTypes.get("reach")).toEqual(["integer", "integer"]);
  });

  test("annotating value documents looseness (widening is allowed)", () => {
    const typed = check("p(1: value).");
    expect(typed.columnTypes.get("p")).toEqual(["integer"]);
  });

  test("annotation narrower than inference is rejected", () => {
    // The column holds arbitrary values; claiming `integer` is unsound.
    expect(() =>
      check(`
        input predicate raw(v: value).
        p(x: integer) :- raw(x).
      `),
    ).toThrow(/column 1 is annotated 'integer' but inferred as 'value'/);
  });

  test("wrong annotation is rejected (string on an integer column)", () => {
    expect(() => check("p(1: string).")).toThrow(
      /column 1 is annotated 'string' but inferred as 'integer'/,
    );
  });

  test("integer may be annotated as float (numeric widening)", () => {
    const typed = check("p(1: float).");
    expect(typed.columnTypes.get("p")).toEqual(["integer"]);
  });

  test("float annotated as integer is rejected", () => {
    expect(() => check("p(1.5: integer).")).toThrow(/annotated 'integer' but inferred as 'float'/);
  });

  test("mixing annotated and unannotated args in one rule is rejected", () => {
    expect(() => check("pair(1: integer, 2).")).toThrow(/all-or-nothing/);
  });

  test("annotating one rule but not another is rejected", () => {
    expect(() =>
      check(`
        p(1: integer).
        p(2).
      `),
    ).toThrow(/all-or-nothing/);
  });

  test("rules disagreeing on the annotated type are rejected", () => {
    // Both rules infer integer, so inference does not conflict; only the
    // annotations disagree.
    expect(() =>
      check(`
        input predicate q(v: integer).
        p(1: integer).
        p(x: value) :- q(x).
      `),
    ).toThrow(/all rules must agree/);
  });

  test("aggregate head positions can be annotated and are checked", () => {
    const typed = check(`
      input predicate edge(a: integer, b: integer).
      fanout(x: integer, count(y): integer) :- edge(x, y).
    `);
    expect(typed.columnTypes.get("fanout")).toEqual(["integer", "integer"]);
  });

  test("a wrong annotation on an aggregate position is rejected", () => {
    expect(() =>
      check(`
        input predicate edge(a: integer, b: integer).
        tally(x: integer, count(y): string) :- edge(x, y).
      `),
    ).toThrow(/column 2 is annotated 'string' but inferred as 'integer'/);
  });

  test("the checked error is an AnalyzerError", () => {
    expect(() => check("p(1: string).")).toThrow(AnalyzerError);
  });
});
