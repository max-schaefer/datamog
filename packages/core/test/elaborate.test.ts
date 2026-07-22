import { describe, expect, test } from "bun:test";
import { parseRaw, postProcess } from "datamog-parser";
import { analyze } from "../src/analyzer.ts";
import { type ModuleResolver, elaborate } from "../src/elaborate.ts";

const MODULES: Record<string, string> = {
  "reach.dl": `
    input predicate edge(src: integer, dst: integer).
    output predicate reach(X, Y) :- edge(X, Y).
    output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
  `,
  // A module that exposes its result via a `?-` default output.
  "keep.dl": `
    input predicate n(a: integer, b: integer).
    ?- n(X, Y), X < Y.
  `,
  // A wiring cycle: a.dl instantiates b.dl and vice versa.
  "a.dl": `
    input predicate p(x: integer) := q from "b.dl".
    output predicate q(X) :- p(X).
  `,
  "b.dl": `
    input predicate p(x: integer) := q from "a.dl".
    output predicate q(X) :- p(X).
  `,
};
// Fresh parse per call (elaborate mutates the returned AST in place).
const resolve: ModuleResolver = (ref) => ({ program: parseRaw(MODULES[ref]!), file: ref });

// biome-ignore lint/suspicious/noExplicitAny: the helpers walk heterogeneous raw AST nodes.
type Stmt = any;
const extDecls = (s: Stmt[]) => s.filter((x) => x.$type === "ExtDecl").map((x) => x.predicate);
const rules = (s: Stmt[]) => s.filter((x) => x.$type === "Rule");
const bodyPreds = (r: Stmt) =>
  r.body.filter((e: Stmt) => e.$type === "Literal").map((e: Stmt) => e.predicate);

describe("elaborate", () => {
  test("instantiates a named module export, aliasing it to the input's name", () => {
    const entry = parseRaw(`
      road(1, 2). road(2, 3).
      input predicate road_reach(a: integer, b: integer) := reach from "reach.dl"(edge = road).
      ?- road_reach(1, X).
    `);
    const { program, dataSources } = elaborate(entry, resolve, "main.dl");
    const stmts = program.statements;

    // The bound input and the module's wired input are gone; the module's
    // `reach` output is renamed to the importer's `road_reach`.
    expect(extDecls(stmts)).toEqual([]);
    const reachRules = rules(stmts).filter((r) => r.head.predicate === "road_reach");
    expect(reachRules).toHaveLength(2);
    // edge -> road (the actual); the recursive self-reference is aliased too.
    expect(bodyPreds(reachRules[0])).toEqual(["road"]);
    expect(bodyPreds(reachRules[1])).toEqual(["road_reach", "road"]);
    expect(dataSources).toEqual([]);

    // The merged program is a valid ordinary program (no binding left to reject).
    postProcess(program);
    expect(() => analyze(program)).not.toThrow();
  });

  test("relabels the instance's head columns with the importer's declared names", () => {
    const entry = parseRaw(`
      road(1, 2).
      input predicate road_reach(a: integer, b: integer) := reach from "reach.dl"(edge = road).
    `);
    const { program } = elaborate(entry, resolve, "main.dl");
    const headVars = (r: Stmt) =>
      r.head.args.map((x: Stmt) => (x.$type === "Variable" ? x.name : x.$type));
    const reachRules = rules(program.statements).filter((r) => r.head.predicate === "road_reach");
    // Head positions carry a/b (module's X,Y renamed); internal join vars stay.
    expect(headVars(reachRules[0])).toEqual(["a", "b"]);
    expect(headVars(reachRules[1])).toEqual(["a", "b"]);
    // The recursive rule's internal var is untouched: road_reach(a, Y), road(Y, b).
    const secondBody = reachRules[1].body.map((e: Stmt) =>
      e.args?.map((x: Stmt) => (x.$type === "Variable" ? x.name : "?")),
    );
    expect(secondBody).toEqual([
      ["a", "Y"],
      ["Y", "b"],
    ]);
  });

  test("collects data-file bindings and clears them", () => {
    const entry = parseRaw(`
      input predicate p(a: integer) := "data/p.csv".
      input predicate q(a: integer) := "q.txt" as csv.
      ?- p(X).
    `);
    const { program, dataSources } = elaborate(entry, resolve, "main.dl");

    expect(dataSources).toEqual([
      { predicate: "p", source: "data/p.csv", format: undefined, baseFile: "main.dl" },
      { predicate: "q", source: "q.txt", format: "csv", baseFile: "main.dl" },
    ]);
    // The declarations survive as free EDBs with their bindings stripped.
    expect(extDecls(program.statements).sort()).toEqual(["p", "q"]);
    postProcess(program);
    expect(() => analyze(program)).not.toThrow();
  });

  test("imports a module's default (?-) output as a named predicate", () => {
    const entry = parseRaw(`
      val(1, 2).
      input predicate kept(x: integer, y: integer) := from "keep.dl"(n = val).
    `);
    const { program } = elaborate(entry, resolve, "main.dl");
    // The default `?-` became a rule aliased to `kept`, exposed so it prints.
    const keptRules = rules(program.statements).filter((r) => r.head.predicate === "kept");
    expect(keptRules.length).toBeGreaterThan(0);
    expect(keptRules.every((r) => r.output)).toBe(true);
    postProcess(program);
    expect(() => analyze(program)).not.toThrow();
  });

  test("rejects a default import when the module has no `?-` default", () => {
    // reach.dl exposes only named outputs, no `?-`.
    const entry = parseRaw('input predicate best(x: integer) := from "reach.dl".');
    expect(() => elaborate(entry, resolve, "main.dl")).toThrow(/no.*default output/);
  });

  test("rejects a module instantiation cycle", () => {
    const entry = parseRaw('input predicate top(x: integer) := q from "a.dl".');
    expect(() => elaborate(entry, resolve, "main.dl")).toThrow(/module import cycle/);
  });
});
