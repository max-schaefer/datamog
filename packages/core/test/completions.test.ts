import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import {
  AGGREGATE_FUNCTION_NAMES,
  BUILTIN_BODY_ATOM_NAMES,
  BUILTIN_FUNCTION_NAMES,
  collectUserPredicates,
  collectVariablesInRule,
  findEnclosingRule,
} from "../src/completions.ts";

describe("collectUserPredicates", () => {
  test("returns every EDB and IDB head in source order, deduped", () => {
    const source = `
      input predicate edge(s: string, d: string).
      input predicate node(n: string).
      reach(X, Y) :- edge(X, Y).
      reach(X, Y) :- edge(X, Z), reach(Z, Y).
      isolated(N) :- node(N), not edge(N, _).
    `;
    const program = parse(source);
    expect(collectUserPredicates(program)).toEqual([
      { name: "edge", arity: 2, kind: "extensional", columns: ["s", "d"] },
      { name: "node", arity: 1, kind: "extensional", columns: ["n"] },
      { name: "reach", arity: 2, kind: "idb" },
      { name: "isolated", arity: 1, kind: "idb" },
    ]);
  });

  test("empty program returns empty list", () => {
    expect(collectUserPredicates(parse(""))).toEqual([]);
  });
});

describe("findEnclosingRule + collectVariablesInRule", () => {
  test("returns the rule the cursor sits in and its user-typed variables", () => {
    const source = `input predicate edge(s: string, d: string).
reach(X, Y) :- edge(X, Z), reach(Z, Y).
`;
    const program = parse(source);
    // Cursor inside the rule body — pick any offset within the rule.
    const cursor = source.indexOf("reach(Z, Y).") + 5;
    const rule = findEnclosingRule(program, cursor);
    expect(rule).toBeDefined();
    expect(rule?.$type).toBe("Rule");
    expect(collectVariablesInRule(rule!)).toEqual(["X", "Y", "Z"]);
  });

  test("filters out synthetic $anon variables introduced for `_`", () => {
    // `_` becomes `$anonN` after postProcess — those shouldn't be
    // proposed as completions, since the user can't type them.
    const source = "input predicate p(x: integer).\nq(X) :- p(X), p(_).\n";
    const program = parse(source);
    const cursor = source.indexOf("p(_)");
    const rule = findEnclosingRule(program, cursor);
    expect(collectVariablesInRule(rule!)).toEqual(["X"]);
  });

  test("returns undefined when cursor sits between statements", () => {
    const source = "input predicate p(x: integer).\n\n?- p(X).\n";
    const program = parse(source);
    // Offset on the blank line between the ExtDecl and the Query.
    const cursor = source.indexOf("\n\n") + 1;
    expect(findEnclosingRule(program, cursor)).toBeUndefined();
  });
});

describe("name list exports", () => {
  test("BUILTIN_FUNCTION_NAMES includes the canonical built-ins", () => {
    // Sample check — the full list lives in `builtins.ts`. Exhaustively
    // pinning the list here would just duplicate that file's source.
    expect(BUILTIN_FUNCTION_NAMES).toContain("sqrt");
    expect(BUILTIN_FUNCTION_NAMES).toContain("upper");
    expect(BUILTIN_FUNCTION_NAMES).toContain("to_json");
  });

  test("AGGREGATE_FUNCTION_NAMES matches the analyzer's aggregate set", () => {
    expect([...AGGREGATE_FUNCTION_NAMES].sort()).toEqual([
      "avg",
      "concat",
      "count",
      "list",
      "max",
      "min",
      "sum",
    ]);
  });

  test("BUILTIN_BODY_ATOM_NAMES includes the iteration primitives", () => {
    expect([...BUILTIN_BODY_ATOM_NAMES].sort()).toEqual(["array_element", "object_entry"]);
  });
});
