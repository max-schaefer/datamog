import { describe, expect, test } from "bun:test";
import { create } from "datamog-backend-sqlite";
import { type ModuleResolver, analyze, elaborate, inferTypes } from "datamog-core";
import { parseRaw, postProcess } from "datamog-parser";
import type { QueryResult } from "../src/backend.ts";
import { DatamogExecutor } from "../src/executor.ts";

// End-to-end: elaborate `:=` module bindings on a raw entry program, then run
// the merged program on a backend. Proves the resolver assembles a valid,
// runnable program from the expansion pass.
const MODULES: Record<string, string> = {
  "reach.dl": `
    input predicate edge(src: integer, dst: integer).
    output predicate reach(X, Y) :- edge(X, Y).
    output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
  `,
  // graph.dl imports filter.dl for its edge relation (a nested instantiation).
  "filter.dl": `
    input predicate raw(a: integer, b: integer).
    output predicate keep(X, Y) :- raw(X, Y), X < Y.
  `,
  "graph.dl": `
    input predicate src(a: integer, b: integer).
    input predicate edge(a: integer, b: integer) := keep from "filter.dl"(raw = src).
    output predicate reach(X, Y) :- edge(X, Y).
    output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
  `,
  // Exposes its result via a `?-` default output rather than a named export.
  "asc.dl": `
    input predicate p(a: integer, b: integer).
    ?- p(X, Y), X < Y.
  `,
  // An ADT (Option) parameterised over its element predicate.
  "option.dl": `
    input predicate elem(v: value).
    output predicate opt()[None].
    output predicate opt()[Some] :- elem(V).
  `,
};
// Fresh parse per call (elaborate mutates the returned AST).
const resolve: ModuleResolver = (ref) => ({ program: parseRaw(MODULES[ref]!), file: ref });

async function run(source: string): Promise<QueryResult[]> {
  const { program } = elaborate(parseRaw(source), resolve, "main.dl");
  postProcess(program);
  const backend = await create();
  try {
    return await new DatamogExecutor(backend).executeAnalyzed(inferTypes(analyze(program)));
  } finally {
    await backend.close();
  }
}

const sortRows = (rows: Record<string, unknown>[]) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const byLabel = (results: QueryResult[], label: string) =>
  sortRows(results.find((r) => r.label === label)!.rows);

describe("module binding end-to-end", () => {
  test("two instances of one module wire to different relations", async () => {
    // The aliased outputs (road_reach / flight_reach) inherit reach.dl's
    // `output` marker, so analysis synthesises a query for each. Result columns
    // carry the importer's declared names (a, b), not the module's head vars.
    const results = await run(`
      road(1, 2). road(2, 3).
      flight(10, 20).
      input predicate road_reach(a: integer, b: integer)   := reach from "reach.dl"(edge = road).
      input predicate flight_reach(a: integer, b: integer) := reach from "reach.dl"(edge = flight).
    `);
    expect(byLabel(results, "road_reach")).toEqual([
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { a: 2, b: 3 },
    ]);
    expect(byLabel(results, "flight_reach")).toEqual([{ a: 10, b: 20 }]);
  });

  test("resolves a nested module import (graph.dl imports filter.dl)", async () => {
    // filter keeps edges with a < b: base {(1,2),(2,3),(3,1)} -> {(1,2),(2,3)};
    // graph's reach is that relation's transitive closure.
    const results = await run(`
      base(1, 2). base(2, 3). base(3, 1).
      input predicate g(a: integer, b: integer) := reach from "graph.dl"(src = base).
    `);
    expect(byLabel(results, "g")).toEqual([
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { a: 2, b: 3 },
    ]);
  });

  test("imports a module's default (?-) output", async () => {
    // asc.dl's default output keeps rows with a < b; import wires p and exposes
    // it as `ordered`, columns relabelled to the importer's declaration.
    const results = await run(`
      raw(1, 2). raw(5, 3). raw(4, 9).
      input predicate ordered(lo: integer, hi: integer) := from "asc.dl"(p = raw).
    `);
    expect(byLabel(results, "ordered")).toEqual([
      { lo: 1, hi: 2 },
      { lo: 4, hi: 9 },
    ]);
  });

  test("prepareElaborated resolves imports and checks boundary types", async () => {
    const { program } = DatamogExecutor.prepareElaborated(
      `road(1, 2). road(2, 3).
       input predicate rr(a: integer, b: integer) := reach from "reach.dl"(edge = road).`,
      resolve,
      "main.dl",
    );
    const backend = await create();
    try {
      const results = await new DatamogExecutor(backend).executeAnalyzed(program);
      expect(byLabel(results, "rr")).toEqual([
        { a: 1, b: 2 },
        { a: 1, b: 3 },
        { a: 2, b: 3 },
      ]);
    } finally {
      await backend.close();
    }

    // A declared type that disagrees with the module's output is rejected.
    expect(() =>
      DatamogExecutor.prepareElaborated(
        `road(1, 2). input predicate rr(a: string, b: string) := reach from "reach.dl"(edge = road).`,
        resolve,
        "main.dl",
      ),
    ).toThrow(/column 1 has type 'integer' but 'string'/);
  });

  test("imported ADT constructors are writable and distinct per instance", async () => {
    // Two Option instances; each instance's constructors are named after its
    // binding (int_opt_Some, colour_opt_Some), so both are matchable at once.
    const results = await run(`
      n(1). n(2).
      colour("red").
      input predicate int_opt(o: value)    := opt from "option.dl"(elem = n).
      input predicate colour_opt(o: value) := opt from "option.dl"(elem = colour).
      output predicate int_some(V)    :- P : int_opt,    P = int_opt_Some(V).
      output predicate colour_some(V) :- Q : colour_opt, Q = colour_opt_Some(V).
    `);
    expect(byLabel(results, "int_some")).toEqual([{ V: 1 }, { V: 2 }]);
    expect(byLabel(results, "colour_some")).toEqual([{ V: "red" }]);
  });
});
