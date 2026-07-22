import { describe, expect, test } from "bun:test";
import type { Literal, Rule } from "../src/index.ts";
import { parse } from "../src/index.ts";

// Nullary (0-arity) predicates are written `p()`; a bare `p` stays a variable,
// so the empty parens are what mark an atom.
describe("nullary predicates", () => {
  test("nullary head", () => {
    const program = parse("input predicate q(x: integer).\np() :- q(1).");
    const rule = program.statements.find((s) => s.$type === "Rule") as Rule;
    expect(rule.head.predicate).toBe("p");
    expect(rule.head.args).toHaveLength(0);
  });

  test("nullary fact (empty head and body)", () => {
    const program = parse("p().");
    const rule = program.statements[0] as Rule;
    expect(rule.head.args).toHaveLength(0);
    expect(rule.body).toHaveLength(0);
  });

  test("positive and negated nullary body atoms", () => {
    const program = parse("r() :- p(), not s().");
    const rule = program.statements[0] as Rule;
    const atoms = rule.body.filter((b) => b.$type === "Literal") as Literal[];
    expect(atoms).toHaveLength(2);
    expect(atoms[0]!.predicate).toBe("p");
    expect(atoms[0]!.args).toHaveLength(0);
    expect(atoms[0]!.negated).toBeFalsy();
    expect(atoms[1]!.predicate).toBe("s");
    expect(atoms[1]!.negated).toBe(true);
    expect(atoms[1]!.args).toHaveLength(0);
  });

  test("nullary query", () => {
    const program = parse("?- p().");
    const query = program.statements[0] as { $type: string; body: Literal[] };
    expect(query.$type).toBe("Query");
    expect(query.body[0]!.predicate).toBe("p");
    expect(query.body[0]!.args).toHaveLength(0);
  });
});
