import { describe, expect, test } from "bun:test";
import { create as createSqlite } from "datamog-backend-sqlite";
import { IncrementalSession } from "../src/incremental.ts";
import type { ExtensionalLoader } from "../src/loader.ts";

describe("IncrementalSession", () => {
  test("a session can ask several `?-` queries in turn (queries are transient)", async () => {
    // Regression: the one-default-output rule must apply to a file, not to the
    // accumulated REPL session, so a second query must not be rejected.
    const sqlite = await createSqlite();
    try {
      const session = new IncrementalSession(sqlite);
      await session.addStatements("edge(1, 2). edge(2, 3).");
      const r1 = await session.addStatements("?- edge(X, Y).");
      expect(r1.queries).toHaveLength(1);
      expect(r1.queries[0]!.rows).toHaveLength(2);
      const r2 = await session.addStatements("?- edge(1, Y).");
      expect(r2.queries).toHaveLength(1);
      expect(r2.queries[0]!.rows).toEqual([{ Y: 2 }]);
    } finally {
      await sqlite.close();
    }
  });

  test("a named output emits once, labelled by name, and is not re-emitted", async () => {
    const sqlite = await createSqlite();
    try {
      const session = new IncrementalSession(sqlite);
      await session.addStatements("edge(1, 2). edge(2, 3).");
      const r1 = await session.addStatements("output predicate ends(Y) :- edge(_, Y).");
      expect(r1.queries).toHaveLength(1);
      expect(r1.queries[0]!.label).toBe("ends");
      // A later chunk must not re-emit the already-printed output; only the
      // new `?-` default (labelled "default") appears.
      const r2 = await session.addStatements("?- edge(X, Y).");
      expect(r2.queries.map((q) => q.label)).toEqual(["default"]);
    } finally {
      await sqlite.close();
    }
  });

  test("Regression: an `output predicate default` rule emits once, not on every later chunk", async () => {
    // The transient `?-` default is re-runnable, so the dedup gate exempted the
    // name "default". But an `output predicate` literally named `default` is a
    // persistent rule: the analyzer re-synthesises its query on every chunk, so
    // exempting "default" made it re-print on every later (unrelated) chunk.
    const sqlite = await createSqlite();
    try {
      const session = new IncrementalSession(sqlite);
      await session.addStatements("edge(1, 2). edge(2, 3).");
      const r1 = await session.addStatements("output predicate default(Y) :- edge(_, Y).");
      expect(r1.queries.map((q) => q.label)).toEqual(["default"]);
      const r2 = await session.addStatements("foo(9).");
      expect(r2.queries.map((q) => q.label)).toEqual([]);
    } finally {
      await sqlite.close();
    }
  });

  test("Regression: a mid-chunk failure does not wedge an earlier declaration", async () => {
    // applySql mutates `appliedTables` in place, but the AST commit is rolled
    // back when a later statement in the chunk throws. `checkRedefinition`
    // read the (non-rolled-back) `appliedTables`, so a predicate declared
    // before a failing statement could afterwards be neither re-declared nor
    // referenced. Base the redefinition check on the committed AST instead.
    const sqlite = await createSqlite();
    try {
      const failingLoader: ExtensionalLoader = {
        name: "fails-for-b",
        canLoad: async (decl) => decl.predicate === "b",
        load: async () => {
          throw new Error("simulated loader failure");
        },
      };
      const session = new IncrementalSession(sqlite, [failingLoader]);
      await expect(
        session.addStatements("input predicate a(x: integer).\ninput predicate b(y: integer)."),
      ).rejects.toThrow(/simulated loader failure/);
      // `a` was fully applied before `b` failed; the session must still let a
      // later chunk re-declare and use it rather than wedging until `:reset`.
      const r = await session.addStatements(
        "input predicate a(x: integer).\nreachable(X) :- a(X).\n?- reachable(X).",
      );
      expect(r.queries).toHaveLength(1);
    } finally {
      await sqlite.close();
    }
  });
});
