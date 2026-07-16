# Chapter 15 — Proof terms

Every query so far has answered a *what*: which tuples are in a
predicate. Datalog is also, quietly, tracking a *how* — the way
each tuple was derived. A fact might follow from a single rule
application or from a long chain of them, and often more than
one chain reaches the same fact. That derivation is real
information, and Datamog lets you name it, capture it, and
compute with it.

The mechanism is small: give a rule a name, and its predicate
starts carrying **proof terms**, one per derivation. This is the
Curry-Howard reading of a Horn clause taken literally: a
predicate (fixed by its arguments) is a *proposition*, each
named rule is a *constructor*, and a proof term is an
*inhabitant*. So a named predicate is an algebraic datatype and
its proof terms are the values of that type. We'll build up to
that with four small datatypes.

## Naming a rule

Write a constructor name in brackets after the head:

```prolog
colour()[Red].
colour()[Green].
colour()[Blue].
```

`colour` is a nullary predicate with three rules, now named
`Red`, `Green`, and `Blue`. Ask for its proof terms by capturing
them with the `:` prefix; read `C : colour()` as "C is a proof
of `colour()`":

```prolog
?- C : colour().
```

```
Red()
Green()
Blue()
```

Three rules, three proof terms: an enum. Each constructor is
nullary because the rules have empty bodies.

## Constructors with arguments

A rule with a body carries the witnesses of its **existential
body variables** — the variables that appear in the body but not
the head:

```prolog
num(1). num(2).
num_pair()[MkPair] :- num(Left), num(Right).

?- P : num_pair().
```

```
MkPair(1, 1)
MkPair(1, 2)
MkPair(2, 1)
MkPair(2, 2)
```

`num_pair()` is still nullary, but each *derivation* picks a
`Left` and a `Right`, so each proof term records that choice. The
proof terms are exactly the pairs.

Give a predicate a base case and a witnessed case and you get an
optional-like type:

```prolog
num_opt()[None].
num_opt()[Some] :- num(Val).

?- P : num_opt().
```

```
None()
Some(1)
Some(2)
```

## Recursion: the proof terms *are* the data

When a rule's body refers to a proof-carrying predicate, that
atom's proof term is included as a **sub-proof**. Recursion
therefore nests:

```prolog
num(7).
num_list(0)[Nil].
num_list(n + 1)[Cons] :- num(Car), n <= 3, num_list(n).

?- Xs : num_list(Len).
```

```
Nil()
Cons(7, Nil())
Cons(7, Cons(7, Nil()))
...
```

Nothing in the `Cons` rule mentions the sub-proof explicitly:
every positive proof-carrying body atom contributes one
automatically, in body order, after the existential-variable
witnesses. So `Cons` takes two arguments, `Car` (an existential
value) and the sub-proof of `num_list(n)`. The proof terms of
`num_list` *are* the lists of numbers, a length-indexed list
datatype built for free out of the derivation structure.

Under the hood a proof term is an ordinary `value` (Chapter 14):
the object `{"$proof": "Cons", "args": [7, ...]}`, with a
reserved `$proof` key so it can't be mistaken for your own data.
The CLI and playground tables print it in the friendlier
constructor form; `to_json` or the JSON output show the raw object.

## Capturing and suppressing

There are three ways to treat a proof-carrying body atom:

- **bare** `num_list(n)` — its sub-proof is included anonymously
  (what the `Cons` rule above does).
- **capture** `V : num_list(n)` — bind the sub-proof to `V` so
  you can output it or pass it along (what the queries above do).
- **suppress** `_ : num_list(n)` — drop the sub-proof, keeping it
  out of the enclosing constructor.

Suppression is about more than tidiness. A derivation set can be
*infinite* even when the fact set is finite: transitive closure
over a cyclic graph proves the same reachabilities in endlessly
many ways, so the nested proof term grows without bound. That is
the same value growth the finiteness lens (Chapter 5, spec §5.8)
warns about, and `--warn-finiteness` flags the proof column.
Suppressing the recursive sub-proof cuts the nesting:

```prolog
reach(X, Y)[Direct] :- edge(X, Y).
reach(X, Z)[Step]   :- edge(X, Y), _ : reach(Y, Z).
```

A `Step` proof now records only the intermediate node, not the
whole sub-derivation, so `reach` stays finite over any graph.

## Taking proof terms apart

Capturing gives you a whole proof term; often you want to look *inside* one. Put
a constructor on one side of an equality and it becomes a **pattern**:

```prolog
opt_value(V) :- P : num_opt(), P = Some(V).
```

`P = Some(V)` matches `P` against the `Some` constructor and binds `V` to its
argument; the `None` proofs simply don't match, so `opt_value` collects the
values that were wrapped in `Some`. In a pattern a variable binds, a literal has
to match, `_` ignores a position, and a nested pattern like `Cons(_, Cons(X, _))`
reaches deeper in.

Because each rule matches one constructor, ordinary rule disjunction gives you
case analysis, and recursion gives you folds. Summing a list proof term:

```prolog
list_sum(P, 0) :- P : num_list(_), P = Nil().
list_sum(P, S) :- P : num_list(_), P = Cons(H, T), list_sum(T, S0),
                  S = as_integer(H) + S0.
```

The `Nil` rule is the base case; the `Cons` rule peels off the head `H`, sums
the tail `T` recursively, and adds them. Two things to note: the value being
matched must already be bound (here `P` comes from the `P : num_list(_)`
capture), and a destructured component comes out as a `value`, so `H` needs an
explicit `as_integer` before the arithmetic. Under the hood a pattern is just
sugar for the JSON accessors of Chapter 14: `P["$proof"]` for the tag and
`P["args"][i]` for the components.

## Building new lists

Matching takes a list apart; the same constructor syntax, used in an *argument*
position, puts one together. `Cons(H, R)` as a rule-head argument builds a new
list proof term (there it is construction, not a pattern, since patterns only
live on one side of a body equality). That is enough to write append:

```prolog
append(Nil(), B, B) :- B : num_list(_).
append(A, B, Cons(H, R)) :- A : num_list(_), A = Cons(H, T), append(T, B, R).
```

The base case passes `B` through; the recursive case peels `A`'s head `H` with a
pattern and rebuilds it onto the appended tail with `Cons(H, R)`. `reverse` then
falls out by folding append over the elements. Two caveats: every list argument
has to be captured from a list predicate (`A : num_list(_)`) so it is
range-restricted, which bounds these programs to the lists that predicate
enumerates; and because each `Cons` becomes nested JSON, construction-heavy
programs are best run on the `native` / `seminaive` backends (the SQL
translation can outgrow a SQL engine's expression-depth limit).

## A few rules of the road

- Naming is all-or-nothing: name every rule for a predicate, or
  none.
- Constructor names are global and must be unique.
- A proof-carrying predicate can't also aggregate.
- A proof mark applies only to a positive, proof-carrying atom,
  not to an extensional predicate and not to a negated atom.

Proof terms desugar to one extra `value` column plus a little
construction in the head, so they run on every backend. As with
any recursion, though, a *non-linearly* recursive proof predicate
is rejected by the SQL backends and runs only on `native` and
`seminaive`.

## Exercises

### Exercise 15.1 — Booleans as a datatype ★

Define a nullary predicate `bit()` with two constructors, `O` and
`I`, and query its proof terms. You have just built `Bool`.

### Exercise 15.2 — Binary trees ★★

With `num(1). num(2).`, define `tree(depth)` whose proof terms
are complete binary trees of numbers: a `Leaf` carrying a number
at depth 0, and a `Node` joining two depth-`d` subtrees into one
of depth `d + 1`. Cap the depth with a guard. (Two recursive body
atoms make this non-linear, so run it on `--backend native`.)
What do the proof terms look like?

### Exercise 15.3 — Included vs. suppressed ★★★

Take the `reach` example over a small cyclic graph. Run it once
with the recursive sub-proof *included* and `--warn-finiteness`,
and observe the warning. Then suppress it with `_ :` and compare.
What does each `Step` proof term tell you, and what does it leave
out?

### Exercise 15.4 — Length by folding ★★

Building on the `num_list` datatype, define `list_len(P, N)` that computes the
length `N` of a list proof term `P` by pattern-matching (`Nil` gives 0, `Cons`
adds 1 to the tail's length). Confirm it agrees with the index the list is built
at.

---

Next: **[Appendix A — The three lenses cheat sheet](A-lenses.md)**.
