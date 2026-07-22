import { describe, expect, test } from "bun:test";
import { parseRaw } from "datamog-parser";
import { expandModule } from "../src/expand.ts";

// A module with: a wired input (`edge`), a free input (`seed`), a private
// predicate (`mid`), an output predicate (`reach`, two rules), and a
// proof-carrying rule with a constructor (`Mk`).
const MODULE = `
  input predicate edge(a: integer, b: integer).
  input predicate seed(n: integer).
  mid(X, Y) :- edge(X, Y).
  output predicate reach(X, Y) :- mid(X, Y).
  output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
  tagged(N)[Mk] :- seed(N).
`;

// biome-ignore lint/suspicious/noExplicitAny: the helpers walk heterogeneous raw AST nodes.
type Stmt = any;
const extDecls = (s: Stmt[]) => s.filter((x) => x.$type === "ExtDecl").map((x) => x.predicate);
const rules = (s: Stmt[]) => s.filter((x) => x.$type === "Rule");
const bodyPreds = (rule: Stmt) =>
  rule.body.filter((e: Stmt) => e.$type === "Literal").map((e: Stmt) => e.predicate);

describe("expandModule", () => {
  test("substitutes wired inputs, freshens locals and constructors, keeps free inputs", () => {
    const stmts = expandModule(parseRaw(MODULE), { prefix: "I$", inputs: { edge: "road" } });

    // The wired input's declaration is dropped; the free input's is kept as-is.
    expect(extDecls(stmts)).toEqual(["seed"]);

    // Local predicates (private + output) are freshened; heads point at the
    // prefixed names.
    expect(rules(stmts).map((r) => r.head.predicate)).toEqual([
      "I$mid",
      "I$reach",
      "I$reach",
      "I$tagged",
    ]);

    // Body references: the wired input becomes the actual (`road`); the free
    // input stays `seed`; local references are freshened.
    const byHead = (name: string) => rules(stmts).filter((r) => r.head.predicate === name);
    expect(bodyPreds(byHead("I$mid")[0])).toEqual(["road"]);
    expect(bodyPreds(byHead("I$reach")[0])).toEqual(["I$mid"]);
    expect(bodyPreds(byHead("I$reach")[1])).toEqual(["I$reach", "road"]);
    expect(bodyPreds(byHead("I$tagged")[0])).toEqual(["seed"]);

    // The proof constructor is freshened.
    expect(byHead("I$tagged")[0].ruleName).toBe("I$Mk");
  });

  test("a second instantiation uses a distinct prefix (no name or constructor clash)", () => {
    const one = expandModule(parseRaw(MODULE), { prefix: "A$", inputs: { edge: "road" } });
    const two = expandModule(parseRaw(MODULE), { prefix: "B$", inputs: { edge: "flight" } });
    const ctors = (s: Stmt[]) =>
      rules(s)
        .map((r) => r.ruleName)
        .filter(Boolean);
    // Freshened names and constructors are disjoint across the two instances.
    expect(ctors(one)).toEqual(["A$Mk"]);
    expect(ctors(two)).toEqual(["B$Mk"]);
    const heads = (s: Stmt[]) => new Set(rules(s).map((r) => r.head.predicate));
    for (const h of heads(one)) expect(heads(two).has(h)).toBe(false);
  });
});
