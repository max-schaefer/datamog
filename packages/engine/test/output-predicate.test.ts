import { describe, expect, test } from "bun:test";
import { create as createSqlite } from "datamog-backend-sqlite";
import type { QueryResult } from "../src/backend.ts";
import { DatamogExecutor } from "../src/executor.ts";

// Run a program on both the SQL (sqlite) and pure-TS (native) backends and
// return each backend's full result list, so the same assertions check that
// named outputs behave identically across the SQL translator and the
// interpreter.
async function runBoth(source: string): Promise<QueryResult[][]> {
  const sqlite = await createSqlite();
  try {
    const sqliteResults = await new DatamogExecutor(sqlite).execute(source);
    const { create: createNative } = await import("../../backend/native/src/index.ts");
    const native = await createNative();
    try {
      const nativeResults = await new DatamogExecutor(native).execute(source);
      return [sqliteResults, nativeResults];
    } finally {
      await native.close();
    }
  } finally {
    await sqlite.close();
  }
}

function sortRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe("output predicates", () => {
  test("an output rule prints a labelled result, interleaved with ?- queries in source order", async () => {
    const source = `
      edge(1, 2).
      edge(2, 3).
      edge(3, 4).
      path(X, Y) :- edge(X, Y).
      path(X, Z) :- path(X, Y), edge(Y, Z).
      output predicate reachable_from_1(N) :- path(1, N).
      ?- edge(A, B).
    `;
    for (const results of await runBoth(source)) {
      expect(results).toHaveLength(2);
      // The output decl precedes the ?- query in source, so it comes first.
      expect(results[0]!.label).toBe("reachable_from_1");
      expect(sortRows(results[0]!.rows)).toEqual([{ N: 2 }, { N: 3 }, { N: 4 }]);
      // The plain query carries no label; its columns are the body variables.
      expect(results[1]!.label).toBeUndefined();
      expect(sortRows(results[1]!.rows)).toEqual([
        { A: 1, B: 2 },
        { A: 2, B: 3 },
        { A: 3, B: 4 },
      ]);
    }
  });

  test("a predicate with several output-marked rules yields a single result", async () => {
    const source = `
      edge(1, 2).
      edge(2, 3).
      output predicate reach(X, Y) :- edge(X, Y).
      output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
    `;
    for (const results of await runBoth(source)) {
      expect(results).toHaveLength(1);
      expect(results[0]!.label).toBe("reach");
      // Column names come from the first output rule's head variables (X, Y).
      expect(sortRows(results[0]!.rows)).toEqual([
        { X: 1, Y: 2 },
        { X: 1, Y: 3 },
        { X: 2, Y: 3 },
      ]);
    }
  });
});
