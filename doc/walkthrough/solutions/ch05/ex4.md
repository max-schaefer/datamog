# Exercise 5.4 — Why seminaive doesn't handle negation directly

Seminaive's correctness argument rests on **monotonicity**: every
new fact is derived from existing ones, so the total set only
grows, and a delta-based iteration is sufficient to catch every
new derivation.

`orphan(X) :- person(X), not has_parent(X).` breaks monotonicity.
Adding a row to `has_parent` can *remove* rows from `orphan`.
Concretely:

- At iteration *k*, `has_parent` does not contain `x`, so
  `orphan(x)` gets derived.
- At iteration *k+1*, a new `has_parent(x)` appears. Now
  `orphan(x)` is *wrong*, but seminaive's delta-based iteration
  has no mechanism to retract it — deltas only *add*.

Seminaive can't handle this directly because the very invariant
it relies on ("any new fact required at least one previous delta
row as premise") doesn't extend to negative premises. A negative
premise `not p(x)` is satisfied by *all the rows that are **not**
in p* — there's no "delta of absences" to track.

## The standard fix: stratification

Before firing any rule that uses `not p(...)`, compute `p` to its
full fixed point. Then the "not in `p`" test is against a
**frozen** relation, which *is* monotone from the perspective of
the rule using it.

Stratification formalises this by partitioning predicates into
numbered **strata** such that:

- Every positive dependency goes to the same or a lower stratum.
- Every negative dependency goes to a *strictly* lower stratum.

The engine evaluates strata in order. Each stratum is computed
seminaively (internally monotone); only after a stratum's fixed
point is reached does the next stratum see it — and by then it's
fixed, so negation against it is safe.

If the dependency graph *can't* be stratified — i.e., there's a
cycle that includes a negative edge — the program is rejected as
*non-stratifiable*, and Datamog refuses to compile it. Chapter 8
shows this in action.
