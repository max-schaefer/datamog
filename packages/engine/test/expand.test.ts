import { describe, expect, test } from "bun:test";
import { create } from "datamog-backend-sqlite";
import { type Program, analyze, expandModule, inferTypes } from "datamog-core";
import { parseRaw, postProcess } from "datamog-parser";
import type { QueryResult } from "../src/backend.ts";
import { DatamogExecutor } from "../src/executor.ts";

// End-to-end: expand module instantiations onto a raw importer AST, merge,
// post-process once, then analyze + run on a backend. This exercises the whole
// functor pipeline short of the (not-yet-built) module-reference grammar and
// resolver.
async function run(program: Program): Promise<QueryResult[]> {
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

describe("module expansion end-to-end", () => {
  test("two instantiations of a reachability module wire to different relations", async () => {
    const reach = `
      input predicate edge(src: integer, dst: integer).
      output predicate reach(X, Y) :- edge(X, Y).
      output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
    `;
    // The importer supplies the leaf relations; the expanded instances' output
    // markers synthesise the `?- a$reach(...)` / `?- b$reach(...)` queries at
    // analysis time, so nothing needs to name the `$`-freshened predicates.
    const importer = parseRaw(`
      road(1, 2). road(2, 3).
      flight(10, 20).
    `);
    importer.statements.push(
      ...expandModule(parseRaw(reach), { prefix: "a$", inputs: { edge: "road" } }),
      ...expandModule(parseRaw(reach), { prefix: "b$", inputs: { edge: "flight" } }),
    );
    postProcess(importer);

    const results = await run(importer);
    // Instance A is the transitive closure of `road`; instance B of `flight`.
    // They coexist without colliding.
    expect(byLabel(results, "a$reach")).toEqual([
      { X: 1, Y: 2 },
      { X: 1, Y: 3 },
      { X: 2, Y: 3 },
    ]);
    expect(byLabel(results, "b$reach")).toEqual([{ X: 10, Y: 20 }]);
  });

  test("freshening proof constructors lets two instances of an ADT module coexist", async () => {
    const nat = `
      input predicate base(n: integer).
      output predicate wrap(N) :: Mk :- base(N).
    `;
    const merged = (prefixA: string, prefixB: string): Program => {
      const importer = parseRaw("lo(1).\nhi(2).");
      importer.statements.push(
        ...expandModule(parseRaw(nat), { prefix: prefixA, inputs: { base: "lo" } }),
        ...expandModule(parseRaw(nat), { prefix: prefixB, inputs: { base: "hi" } }),
      );
      return importer;
    };

    // Distinct prefixes freshen the `Mk` constructor to `a$Mk` / `b$Mk`, so the
    // merged program's global constructor-uniqueness check passes and both run.
    const ok = merged("a$", "b$");
    postProcess(ok);
    const results = await run(ok);
    expect(byLabel(results, "a$wrap")).toEqual([{ N: 1 }]);
    expect(byLabel(results, "b$wrap")).toEqual([{ N: 2 }]);

    // Without freshening (same prefix) both instances mint the same `Mk`, which
    // the post-process constructor-uniqueness check rejects. This is exactly
    // what per-instance freshening exists to prevent.
    expect(() => postProcess(merged("x$", "x$"))).toThrow(/used by more than one rule/);
  });
});
