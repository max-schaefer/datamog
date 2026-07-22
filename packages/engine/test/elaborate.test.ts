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
});
