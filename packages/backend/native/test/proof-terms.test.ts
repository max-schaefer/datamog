import { describe, expect, test } from "bun:test";
import { create } from "datamog-backend-native";
import { DatamogExecutor } from "datamog-engine";

// Proof-term ADTs: a rule head annotated with `[Ctor]` names a rule; the
// predicate then carries an implicit `value` column holding the derivation as
// a tagged object `{ "$proof": Ctor, "args": [...] }`. Constructor args are the
// values of the existential body variables followed by the sub-proofs of the
// positive proof-carrying body atoms. A body/query atom is captured with the
// prefix `V : p(...)` and suppressed with `_ : p(...)`.

async function run(source: string): Promise<Record<string, unknown>[][]> {
  const backend = await create();
  const executor = new DatamogExecutor(backend);
  try {
    const results = await executor.execute(source);
    return results.map((r) => r.rows);
  } finally {
    await backend.close();
  }
}

// Sort key that is independent of object key order, so rows compare as sets
// regardless of how a backend orders the keys inside a `value` object.
function canonKey(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

function sortRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => canonKey(a).localeCompare(canonKey(b)));
}

const proof = (ctor: string, args: unknown[]): unknown => ({ $proof: ctor, args });

describe("proof terms", () => {
  test("enums: nullary named facts are nullary constructors", async () => {
    const rows = (
      await run(`
        colour()[Red].
        colour()[Green].
        colour()[Blue].
        ?- C : colour().
      `)
    )[0]!;
    expect(sortRows(rows)).toEqual(
      sortRows([{ C: proof("Red", []) }, { C: proof("Green", []) }, { C: proof("Blue", []) }]),
    );
  });

  test("pairs: existential body variables become constructor args", async () => {
    const rows = (
      await run(`
        num(1). num(2).
        num_pair()[MkPair] :- num(Left), num(Right).
        ?- P : num_pair().
      `)
    )[0]!;
    expect(sortRows(rows)).toEqual(
      sortRows([
        { P: proof("MkPair", [1, 1]) },
        { P: proof("MkPair", [1, 2]) },
        { P: proof("MkPair", [2, 1]) },
        { P: proof("MkPair", [2, 2]) },
      ]),
    );
  });

  test("optional: a base constructor and a witnessed one", async () => {
    const rows = (
      await run(`
        num(1). num(2).
        num_opt()[None].
        num_opt()[Some] :- num(Val).
        ?- P : num_opt().
      `)
    )[0]!;
    expect(sortRows(rows)).toEqual(
      sortRows([{ P: proof("None", []) }, { P: proof("Some", [1]) }, { P: proof("Some", [2]) }]),
    );
  });

  test("lists: recursion nests the sub-proof automatically (no binder needed)", async () => {
    const rows = (
      await run(`
        num(7).
        short_num_list(0)[Nil].
        short_num_list(n + 1)[Cons] :- num(Car), n <= 2, short_num_list(n).
        ?- P : short_num_list(L).
      `)
    )[0]!;
    const nil = proof("Nil", []);
    const cons = (tail: unknown): unknown => proof("Cons", [7, tail]);
    expect(sortRows(rows)).toEqual(
      sortRows([
        { L: 0, P: nil },
        { L: 1, P: cons(nil) },
        { L: 2, P: cons(cons(nil)) },
        { L: 3, P: cons(cons(cons(nil))) },
      ]),
    );
  });

  test("capture binder surfaces a proof term as an ordinary value", async () => {
    const rows = (
      await run(`
        colour()[Red].
        colour()[Green].
        seen(C) :- C : colour().
        ?- seen(C).
      `)
    )[0]!;
    expect(sortRows(rows)).toEqual(sortRows([{ C: proof("Red", []) }, { C: proof("Green", []) }]));
  });

  test("suppress (_ :) omits a sub-proof; a bare atom includes it", async () => {
    const suppressed = (
      await run(`
        edge(1, 2). edge(2, 3).
        reach(X, Y)[Direct] :- edge(X, Y).
        reach(X, Z)[Step] :- edge(X, Y), _ : reach(Y, Z).
        ?- P : reach(X, Z).
      `)
    )[0]!;
    // Step records only the intermediate node (Y), not the nested sub-proof.
    expect(sortRows(suppressed)).toEqual(
      sortRows([
        { X: 1, Z: 2, P: proof("Direct", []) },
        { X: 2, Z: 3, P: proof("Direct", []) },
        { X: 1, Z: 3, P: proof("Step", [2]) },
      ]),
    );

    const included = (
      await run(`
        edge(1, 2). edge(2, 3).
        reach(X, Y)[Direct] :- edge(X, Y).
        reach(X, Z)[Step] :- edge(X, Y), reach(Y, Z).
        ?- P : reach(X, Z).
      `)
    )[0]!;
    // A bare recursive atom nests the sub-proof.
    expect(sortRows(included)).toEqual(
      sortRows([
        { X: 1, Z: 2, P: proof("Direct", []) },
        { X: 2, Z: 3, P: proof("Direct", []) },
        { X: 1, Z: 3, P: proof("Step", [2, proof("Direct", [])]) },
      ]),
    );
  });

  test("distinct derivations are distinct proof terms; identical ones dedup", async () => {
    // Two rules proving the same nullary goal give two proof terms; a rule that
    // can fire two ways gives two more. Set semantics dedup only exact repeats.
    const rows = (
      await run(`
        num(1). num(2).
        ok()[FromOne] :- num(1).
        ok()[FromAny] :- num(N).
        ?- P : ok().
      `)
    )[0]!;
    expect(sortRows(rows)).toEqual(
      sortRows([
        { P: proof("FromOne", []) },
        { P: proof("FromAny", [1]) },
        { P: proof("FromAny", [2]) },
      ]),
    );
  });

  describe("validation", () => {
    test("rejects mixing named and unnamed rules for one predicate", async () => {
      await expect(run("c()[A].\nc().\n?- P : c().")).rejects.toThrow(
        /mixes named and unnamed rules/,
      );
    });

    test("rejects a constructor name used by more than one rule", async () => {
      await expect(run("a()[Dup].\nb()[Dup].\n?- P : a().")).rejects.toThrow(
        /used by more than one rule/,
      );
    });

    test("rejects capturing a proof from a predicate with no named rules", async () => {
      await expect(run("n(1). dummy()[D].\nq(X) :- P : n(X).\n?- q(X).")).rejects.toThrow(
        /Cannot capture a proof from 'n'/,
      );
    });

    test("rejects marking a proof on a negated atom", async () => {
      await expect(run("c()[A].\nc()[B].\nq() :- P : not c().\n?- q().")).rejects.toThrow(
        /negated atom/,
      );
    });
  });
});
