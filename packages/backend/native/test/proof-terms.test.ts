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

  test("a don't-care body variable is not a constructor witness", async () => {
    // `_` carries no information, so it must not be recorded in the proof term:
    // Only(X) records X, and the num(_) side contributes nothing (so the two
    // derivations of each X collapse to one proof term).
    const rows = (
      await run(`
        num(1). num(2).
        pick()[Only] :- num(X), num(_).
        ?- P : pick().
      `)
    )[0]!;
    expect(sortRows(rows)).toEqual(
      sortRows([{ P: proof("Only", [1]) }, { P: proof("Only", [2]) }]),
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

    test("rejects a constructor pattern under negation", async () => {
      // `not P = Some(3)` hoisted the proof capture positively, silently
      // meaning "a Some(3) proof exists and P != it" instead of "P is not a
      // Some(3) match" (so it dropped every row when no Some(3) existed).
      // Reject it, like a negated proof capture.
      await expect(
        run("val(5). val(6).\nopt()[Some] :- val(X).\nr(P) :- P : opt, not P = Some(3).\n?- r(P)."),
      ).rejects.toThrow(/constructor pattern may not appear under negation/);
    });
  });

  describe("destructuring", () => {
    test("a constructor pattern extracts a component; `_` ignores one", async () => {
      const rows = (
        await run(`
          num(1). num(2).
          num_opt()[None].
          num_opt()[Some] :- num(Val).
          opt_value(V) :- P : num_opt(), P = Some(V).
          ?- opt_value(V).
        `)
      )[0]!;
      // None() has no Some(_) match; Some(1)/Some(2) yield their component.
      expect(sortRows(rows)).toEqual(sortRows([{ V: 1 }, { V: 2 }]));
    });

    test("nested patterns reach into sub-proofs", async () => {
      const rows = (
        await run(`
          num(5).
          num_list(0)[Nil].
          num_list(n + 1)[Cons] :- num(Car), n <= 3, num_list(n).
          second(X) :- P : num_list(_), P = Cons(_, Cons(X, _)).
          ?- second(X).
        `)
      )[0]!;
      expect(sortRows(rows)).toEqual(sortRows([{ X: 5 }]));
    });

    test("folds over a recursive proof term (case analysis via multiple rules)", async () => {
      const rows = (
        await run(`
          num(7).
          num_list(0)[Nil].
          num_list(n + 1)[Cons] :- num(Car), n <= 3, num_list(n).
          list_sum(P, 0) :- P : num_list(_), P = Nil().
          list_sum(P, S) :- P : num_list(_), P = Cons(H, T), list_sum(T, S0), S = as_integer(H) + S0.
          sum_by_len(Len, S) :- P : num_list(Len), list_sum(P, S).
          ?- sum_by_len(Len, S).
        `)
      )[0]!;
      expect(sortRows(rows)).toEqual(
        sortRows([
          { Len: 0, S: 0 },
          { Len: 1, S: 7 },
          { Len: 2, S: 14 },
          { Len: 3, S: 21 },
          { Len: 4, S: 28 },
        ]),
      );
    });

    test("rejects a constructor pattern of the wrong arity", async () => {
      await expect(
        run(`
          num(7).
          num_list(0)[Nil].
          num_list(n + 1)[Cons] :- num(Car), n <= 2, num_list(n).
          bad(X) :- P : num_list(_), P = Cons(X).
          ?- bad(X).
        `),
      ).rejects.toThrow(/'Cons' takes 2/);
    });

    test("rejects a constructor name that collides with a built-in", async () => {
      await expect(run("foo()[length].\n?- P : foo().")).rejects.toThrow(/conflicts with built-in/);
    });
  });

  describe("constructor terms in output positions", () => {
    // A constructor term is always a match, never a value builder, so a head
    // argument like `Cons(H, R)` relates to an existing num_list proof. The
    // head-pattern rules read like Prolog and desugar to captures + accessors.
    const listPrelude = `
      num(1). num(2).
      num_list(0)[Nil].
      num_list(n + 1)[Cons] :- num(Car), n <= 2, num_list(n).
      append(Nil(), B, B) :- B : num_list(_).
      append(Cons(H, T), B, Cons(H, R)) :- append(T, B, R).
    `;
    const nil = proof("Nil", []);

    test("a constructor term in an argument position matches a proof", async () => {
      const rows = (
        await run(`${listPrelude}
          demo(C) :- append(Cons(1, Nil()), Cons(2, Nil()), C).
          ?- demo(C).
        `)
      )[0]!;
      // [1] ++ [2] = [1, 2], which is within the enumerated universe.
      expect(sortRows(rows)).toEqual(
        sortRows([{ C: proof("Cons", [1, proof("Cons", [2, nil])]) }]),
      );
    });

    test("a constructor argument in a query does not leak internal columns", async () => {
      // The query's constructor arguments hoist to internal `$pat` variables;
      // only the user-written `C` should surface as an output column.
      const rows = (
        await run(`${listPrelude}
          ?- append(Cons(1, Nil()), Cons(2, Nil()), C).
        `)
      )[0]!;
      expect(rows.length).toBe(1);
      expect(Object.keys(rows[0]!)).toEqual(["C"]);
      expect(rows[0]!.C).toEqual(proof("Cons", [1, proof("Cons", [2, nil])]));
    });

    test("a result outside the enumerated universe is clipped", async () => {
      // append relates num_list proofs only, so a concatenation longer than the
      // length cap (3 here) has no matching proof and drops out entirely.
      const rows = (
        await run(`${listPrelude}
          demo(C) :- append(Cons(1, Cons(2, Nil())), Cons(1, Cons(2, Nil())), C).
          ?- demo(C).
        `)
      )[0]!;
      // [1, 2] ++ [1, 2] = [1, 2, 1, 2], length 4 > cap: no proof, no rows.
      expect(rows).toEqual([]);
    });

    test("reverse (built on append) reverses a list proof term", async () => {
      const rows = (
        await run(`${listPrelude}
          reverse(Nil(), Nil()).
          reverse(Cons(H, T), R) :- reverse(T, RT), append(RT, Cons(H, Nil()), R).
          demo(R) :- reverse(Cons(1, Cons(2, Nil())), R).
          ?- demo(R).
        `)
      )[0]!;
      // reverse([1, 2]) = [2, 1]
      expect(sortRows(rows)).toEqual(
        sortRows([{ R: proof("Cons", [2, proof("Cons", [1, nil])]) }]),
      );
    });

    test("rejects a constructor term with the wrong arity", async () => {
      await expect(
        run(`
          num(7).
          num_list(0)[Nil].
          num_list(n + 1)[Cons] :- num(Car), n <= 1, num_list(n).
          bad(Cons(7)).
          ?- bad(X).
        `),
      ).rejects.toThrow(/'Cons' takes 2/);
    });
  });

  describe("capture shorthand", () => {
    test("V : p abbreviates V : p() for a nullary predicate", async () => {
      const bare = (await run("colour()[Red].\ncolour()[Green].\n?- C : colour."))[0]!;
      const full = (await run("colour()[Red].\ncolour()[Green].\n?- C : colour()."))[0]!;
      expect(sortRows(bare)).toEqual(sortRows(full));
      expect(bare.length).toBe(2);
    });

    test("V : p fills one don't-care per declared column", async () => {
      // num_list has one declared column (the length index); `X : num_list`
      // ignores it, exactly like `X : num_list(_)`.
      const prog = `
        num(1). num(2).
        num_list(0)[Nil].
        num_list(n + 1)[Cons] :- num(Car), n <= 1, num_list(n).
      `;
      const bare = (await run(`${prog}\n?- X : num_list.`))[0]!;
      const full = (await run(`${prog}\n?- X : num_list(_).`))[0]!;
      expect(sortRows(bare)).toEqual(sortRows(full));
      expect(bare.length).toBeGreaterThan(0);
    });

    test("a bare predicate reference without a capture is not a nullary atom", async () => {
      // Parentheses may be dropped only after a proof capture; `colour` alone
      // is parsed as a variable, not a nullary atom.
      await expect(run("colour()[Red].\nseen() :- colour.\n?- seen().")).rejects.toThrow(
        /Unsafe variable 'colour'/,
      );
    });
  });

  describe("explicit constructor arguments", () => {
    test("[Ctor(args)] records exactly the listed arguments", async () => {
      // Y is an intermediate witness; auto-derivation would record it, but
      // [Mk(X)] keeps it out, so the two derivations of each X collapse to one.
      const rows = (
        await run(`
          num(1). num(2).
          pick()[Mk(X)] :- num(X), num(Y).
          ?- P : pick().
        `)
      )[0]!;
      expect(sortRows(rows)).toEqual(sortRows([{ P: proof("Mk", [1]) }, { P: proof("Mk", [2]) }]));
    });

    test("a chart parser builds clean AST proof terms", async () => {
      // The split position j is a body variable, but [Add(L, R)] keeps it out
      // of the AST -- the proof term carries only the two captured sub-parses.
      const rows = (
        await run(`
          token(0, "num", 2). token(1, "plus", 0). token(2, "num", 3).
          ast(i, i + 1)[Lit(V)] :- token(i, "num", V).
          ast(i, k)[Add(L, R)] :- L : ast(i, j), token(j, "plus", _), R : ast(j + 1, k).
          ?- A : ast(0, 3).
        `)
      )[0]!;
      expect(sortRows(rows)).toEqual(
        sortRows([{ A: proof("Add", [proof("Lit", [2]), proof("Lit", [3])]) }]),
      );
    });
  });
});
