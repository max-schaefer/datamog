import { describe, expect, test } from "bun:test";
import { type TraceEvent, create } from "datamog-backend-native";
import { DatamogExecutor } from "datamog-engine";

async function traceOf(source: string): Promise<TraceEvent[]> {
  const events: TraceEvent[] = [];
  const backend = await create({ trace: (e) => events.push(e) });
  const executor = new DatamogExecutor(backend);
  try {
    await executor.execute(source);
    return events;
  } finally {
    await backend.close();
  }
}

describe("native backend — trace events", () => {
  test("a single-rule non-recursive program emits start/iteration/rule/iteration/end", async () => {
    const events = await traceOf(`
      p(1). p(2). p(3).
      q(X) :- p(X), X > 1.
      ?- q(X).
    `);
    // Keep just the event kinds so the assertion doesn't churn on offsets.
    const kinds = events.map((e) => e.kind);
    // Two strata in dep order: p (facts) and q (one rule). Both strata are
    // non-recursive → one productive iteration plus one confirming no-op.
    expect(kinds).toEqual([
      "stratum-start",
      "iteration-start",
      "rule-applied", // p(1).
      "rule-applied", // p(2).
      "rule-applied", // p(3).
      "iteration-end",
      "iteration-start",
      "rule-applied",
      "rule-applied",
      "rule-applied",
      "iteration-end", // added: 0 — convergence
      "stratum-end",
      "stratum-start",
      "iteration-start",
      "rule-applied", // q(X) :- p(X), X > 1
      "iteration-end",
      "iteration-start",
      "rule-applied",
      "iteration-end", // added: 0
      "stratum-end",
    ]);
  });

  test("stratum-start marks recursion correctly", async () => {
    const events = await traceOf(`
      edge(1, 2). edge(2, 3).
      tc(X, Y) :- edge(X, Y).
      tc(X, Y) :- edge(X, Z), tc(Z, Y).
      ?- tc(X, Y).
    `);
    const starts = events.filter((e) => e.kind === "stratum-start");
    // First stratum is edge (facts, non-recursive); second is tc (recursive).
    expect(starts).toHaveLength(2);
    expect(starts[0]!).toMatchObject({ recursive: false });
    expect(starts[1]!).toMatchObject({ recursive: true, predicates: ["tc"] });
  });

  test("iteration-end reports how many tuples were added that pass", async () => {
    const events = await traceOf(`
      edge(1, 2). edge(2, 3). edge(3, 4).
      tc(X, Y) :- edge(X, Y).
      tc(X, Y) :- edge(X, Z), tc(Z, Y).
      ?- tc(X, Y).
    `);
    const tcStratumEvents: TraceEvent[] = [];
    let inTc = false;
    for (const e of events) {
      if (e.kind === "stratum-start" && e.predicates[0] === "tc") inTc = true;
      if (inTc) tcStratumEvents.push(e);
      if (e.kind === "stratum-end" && inTc) break;
    }
    const iterEnds = tcStratumEvents.filter((e) => e.kind === "iteration-end");
    // tc contains {12, 23, 34} after iter 0 (from the base rule), adds
    // {13, 24} at iter 1, adds {14} at iter 2, adds nothing at iter 3.
    // Numbers: 3, 2, 1, 0.
    expect(iterEnds.map((e) => (e.kind === "iteration-end" ? e.added : -1))).toEqual([3, 2, 1, 0]);
  });

  test("rule-applied events carry the tuples newly added", async () => {
    const events = await traceOf(`
      seed(1).
      reach(X) :- seed(X).
      reach(X) :- reach(Y), X = Y + 1, X <= 3.
      ?- reach(X).
    `);
    const added = events
      .filter((e): e is Extract<TraceEvent, { kind: "rule-applied" }> => e.kind === "rule-applied")
      .flatMap((e) => e.added.map((t) => t.values));
    // Every derived tuple across all rule applications — the fact and the
    // three successful step rules. Set-compare since naive iteration may
    // produce the same tuple from different passes, but dedup keeps them
    // out of `added`.
    expect(new Set(added.map((v) => JSON.stringify(v)))).toEqual(
      new Set([JSON.stringify([1]), JSON.stringify([2]), JSON.stringify([3])]),
    );
  });

  test("edb-loaded fires once per loaded EDB with the loaded tuples", async () => {
    const { create } = await import("datamog-backend-native");
    const { DatamogExecutor, insertRows } = await import("datamog-engine");

    const events: TraceEvent[] = [];
    const backend = await create({ trace: (e) => events.push(e) });
    const executor = new DatamogExecutor(backend, [
      {
        name: "fixture",
        async canLoad(decl) {
          return decl.predicate === "raw";
        },
        async load(decl, b) {
          await insertRows(b, decl, [{ x: 10 }, { x: 20 }]);
          return { rowsLoaded: 2 };
        },
      },
    ]);
    try {
      await executor.execute(`
        input predicate raw(x: integer).
        derived(X) :- raw(X), X > 15.
        ?- derived(X).
      `);
    } finally {
      await backend.close();
    }
    const loaded = events.filter(
      (e): e is Extract<TraceEvent, { kind: "edb-loaded" }> => e.kind === "edb-loaded",
    );
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.predicate).toBe("raw");
    expect(loaded[0]!.tuples.map((t) => t.values)).toEqual([[10], [20]]);
  });
});
