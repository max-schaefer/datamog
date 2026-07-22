import { describe, expect, test } from "bun:test";
import { parse } from "datamog-parser";
import { analyze } from "../src/analyzer.ts";
import { findInfiniteRisks } from "../src/finiteness.ts";
import { inferTypes } from "../src/types.ts";

function analyse(source: string) {
  const program = parse(source);
  const analyzed = inferTypes(analyze(program));
  return findInfiniteRisks(analyzed);
}

function flagged(source: string): string[] {
  return analyse(source)
    .map((d) => `${d.predicate}.${d.columnIndex + 1}`)
    .sort();
}

describe("finiteness analysis", () => {
  test("flags self-recursion through arithmetic", () => {
    // Classic non-terminating: each iteration produces a new integer.
    const source = `
      input predicate seed(x: integer).
      s(X) :- seed(X).
      s(Y) :- s(X), Y = X + 1.
    `;
    expect(flagged(source)).toEqual(["s.1"]);
  });

  test("flags reversed equality self-recursion through arithmetic", () => {
    const source = `
      input predicate seed(x: integer).
      s(X) :- seed(X).
      s(Y) :- s(X), X + 1 = Y.
    `;
    expect(flagged(source)).toEqual(["s.1"]);
  });

  test("flags self-recursion through string concat", () => {
    const source = `
      input predicate seed(x: string).
      s(X) :- seed(X).
      s(Y) :- s(X), Y = X + "a".
    `;
    expect(flagged(source)).toEqual(["s.1"]);
  });

  test("flags self-recursion through parse_json (json constructor)", () => {
    // parse_json builds new JSON values from a string, so a cycle that
    // stringifies a JSON value back into itself is unbounded — same
    // shape as the arithmetic / string-concat case. The general
    // "FunctionCall in a head/body/equality is PLUS" rule covers this
    // without requiring a parse_json-specific case.
    const source = `
      input predicate seed(s: string).
      g(parse_json(S)) :- seed(S).
      g(parse_json(as_string(J))) :- g(J).
    `;
    expect(flagged(source)).toEqual(["g.1"]);
  });

  test("does not flag plain transitive closure", () => {
    // ancestor is recursive but values come from a finite EDB; no PLUS edge.
    const source = `
      input predicate parent(p: string, c: string).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("does not flag mutual recursion without arithmetic", () => {
    const source = `
      input predicate edge(s: string, d: string).
      even_path(X, Y) :- edge(X, Y).
      even_path(X, Y) :- odd_path(X, Z), edge(Z, Y).
      odd_path(X, Y) :- even_path(X, Z), edge(Z, Y).
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("flags Fibonacci-style increment column (only the bound saves it)", () => {
    // The `I < 10` filter doesn't appear in dataflow, so we conservatively
    // flag — that's the user-visible signal for "termination is your job".
    const source = `
      fib_step(1, 0, 1).
      fib_step(I_next, Curr, Next) :-
        fib_step(I, Prev, Curr),
        I < 10,
        I_next = I + 1,
        Next = Prev + Curr.
    `;
    // col1 cycles through I+1; col2 and col3 are tied together via
    // `Next = Prev + Curr` and the body's `(I, Prev, Curr)` reading —
    // they're all on the same value-producing SCC, so all three flag.
    expect(flagged(source)).toEqual(["fib_step.1", "fib_step.2", "fib_step.3"]);
  });

  test("does not flag literal-bounded range", () => {
    // V in [0..10] is finite by construction.
    const source = `
      r(N) :- N in [0 .. 10].
      r2(N) :- r(M), N in [0 .. 10], N > M.
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("flags variable-bounded range pulled from a recursive predicate", () => {
    // The bound depends on the predicate itself, so the range can grow
    // every iteration. Conservatively flag.
    const source = `
      grow(0).
      grow(N) :- grow(M), N in [0 .. M + 1].
    `;
    expect(flagged(source)).toEqual(["grow.1"]);
  });

  test("rename equality is not a PLUS edge", () => {
    // Y = W and W = Y are just renames; they don't manufacture values. The
    // recursion flows through `parent` (an EDB), so it stays bounded.
    const source = `
      input predicate parent(p: string, c: string).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, W), Y = W.
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, W), W = Y.
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("aggregates do not introduce a PLUS edge", () => {
    // count/sum collapse a stream — they don't manufacture out-of-domain
    // values. Aggregate predicates are also non-recursive by analyser
    // rule, so the cycle test wouldn't fire anyway.
    const source = `
      input predicate p(x: integer).
      total(count(*)) :- p(_).
      stats(sum(X)) :- p(X).
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("non-recursive arithmetic is fine", () => {
    // X + 1 in a non-recursive rule: no cycle, no flag.
    const source = `
      input predicate p(x: integer).
      doubled(X, Y) :- p(X), Y = X * 2.
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("span underlines the offending head argument on the recursive rule", () => {
    // Span priority is (i) the head arg at the flagged column index
    // on (ii) the first recursive rule. The base case `s(X) :- seed(X).`
    // shouldn't be picked up — its head arg `X` carries no
    // value-producing edge. The recursive rule's head arg `Y` (which
    // is `X + 1` after binding) is the one we should highlight.
    const source = `
      input predicate seed(x: integer).
      s(X) :- seed(X).
      s(Y) :- s(X), Y = X + 1.
    `;
    const diags = analyse(source);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.severity).toBe("warning");
    expect(d.code).toBe("potentially-infinite-column");
    expect(d.predicate).toBe("s");
    expect(d.columnIndex).toBe(0);
    expect(typeof d.offset).toBe("number");
    expect(typeof d.end).toBe("number");
    expect(d.message).toContain("'s'");
    // The span should be exactly the head argument `Y` of the
    // recursive rule, not the whole head and not the head of the
    // base case.
    const offset = d.offset!;
    const end = d.end!;
    expect(source.slice(offset, end)).toBe("Y");
    // …and the slice must lie inside the recursive rule (whose body
    // contains `Y = X + 1`), not the base case.
    const recursiveRuleStart = source.indexOf("s(Y) :- s(X)");
    expect(offset).toBeGreaterThan(recursiveRuleStart);
  });

  test("multi-column flag attaches each diagnostic to its own head argument", () => {
    // Regression: previously every flagged column for a predicate
    // re-used the same span (the whole rule head), so a rule like
    // `fib_step(I + 1, Curr, Prev + Curr) :- …` produced three
    // diagnostics with identical squigglies and no way to tell which
    // column each warning was about. With per-arg spans, each
    // diagnostic underlines exactly its column.
    const source = `
      fib_step(1, 0, 1).
      fib_step(I_next, Curr, Next) :-
        fib_step(I, Prev, Curr),
        I < 10,
        I_next = I + 1,
        Next = Prev + Curr.
    `;
    const diags = analyse(source);
    expect(diags).toHaveLength(3);
    const slice = (i: number) => source.slice(diags[i]!.offset!, diags[i]!.end!);
    // Diagnostics are ordered by column.
    expect(slice(0)).toBe("I_next");
    expect(slice(1)).toBe("Curr");
    expect(slice(2)).toBe("Next");
  });

  test("recursive predicate with a base case picks the recursive rule's head arg", () => {
    // The first rule by source order is the base case (a fact);
    // the second is the recursive step. We need to pick the second
    // for the span — that's the rule whose head arg loops around the
    // cycle.
    const source = `
      grow(0).
      grow(N + 1) :- grow(N), N < 10.
    `;
    const diags = analyse(source);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.predicate).toBe("grow");
    expect(d.columnIndex).toBe(0);
    expect(source.slice(d.offset!, d.end!)).toBe("N + 1");
  });
});

describe("finiteness of proof terms", () => {
  test("flags the proof column of an unbounded recursive derivation", () => {
    // Transitive closure with named rules: `path` gains an implicit proof
    // column (index 2 -> ".3"). The recursive Trans constructor nests the
    // sub-proof, so over a cyclic graph the proof term grows without bound.
    const source = `
      input predicate edge(a: integer, b: integer).
      path(A, B)[Edge] :- edge(A, B).
      path(A, C)[Trans] :- edge(A, B), path(B, C).
    `;
    expect(flagged(source)).toEqual(["path.3"]);
  });

  test("suppressing the recursive sub-proof (_ :) removes the growth", () => {
    // `_ : path(B, C)` drops the nested sub-proof, so the proof column no
    // longer lies on a value-producing cycle and the derivation stays finite.
    const source = `
      input predicate edge(a: integer, b: integer).
      path(A, B)[Edge] :- edge(A, B).
      path(A, C)[Trans] :- edge(A, B), _ : path(B, C).
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("a non-recursive proof-carrying predicate is finite", () => {
    const source = `
      input predicate num(n: integer).
      num_pair()[MkPair] :- num(Left), num(Right).
    `;
    expect(flagged(source)).toEqual([]);
  });

  test("Regression: flags recursion that re-wraps a value extracted via object_entry", () => {
    // `object_entry`/`array_element` were modelled as plain predicates, so the
    // source->output dataflow was severed and a recursion that extracts an
    // inner value then re-wraps it deeper was not flagged (it loops forever on
    // native / hangs the playground). The source->output flow must be modelled.
    expect(
      flagged(`seed({"n": 0}).
        g(V) :- seed(V).
        g(W) :- g(V), object_entry(V, K, Inner), W = {"n": [Inner]}.
        ?- g(W).`),
    ).toContain("g.1");
    expect(
      flagged(`seed([0]).
        g(V) :- seed(V).
        g(W) :- g(V), array_element(V, K, Inner), W = [Inner].
        ?- g(W).`),
    ).toContain("g.1");
  });

  test("does not flag pure extraction via object_entry (extraction shrinks the value)", () => {
    // Recursively extracting sub-values without re-wrapping terminates (each
    // extracted value is strictly smaller), so it must not be flagged: the
    // source->output edge is not value-producing.
    expect(
      flagged(`seed({"a": {"b": 1}}).
        g(V) :- seed(V).
        g(Inner) :- g(V), object_entry(V, K, Inner).
        ?- g(X).`),
    ).toEqual([]);
  });
});
