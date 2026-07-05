# Exercise 8.5 — Emulating negation without `not`

In **pure positive Datalog** (with no negation and no aggregation),
you can't express set difference. The reason is monotonicity: a
positive program's answer relation can only *grow* as you add input
facts. But adding a `has_parent(alice)` fact should make `alice`
stop being an orphan — so the answer shrinks. Monotone programs
can't do that.

### What about aggregation?

Chapter 9 adds aggregates. With `count`, you could define:

```prolog
parent_count(X, count(P)) :- person(X), parent(P, X).
orphan(X) :- parent_count(X, 0).
```

But wait — this has its own subtlety. `count` over an empty group
is `0`, but grouping in Datalog typically requires *at least one
matching row*, so a person with no parents produces no
`parent_count` row at all, and `orphan` ends up empty. You'd need
either an outer-join style extension (not standard Datalog) or —
in practice — the same `not`-based formulation.

So the right answer is: no, you can't express set difference in
plain-vanilla positive Datalog. `not` (with stratification) is the
*minimal* addition that makes set-difference-style queries
possible, and that's exactly why it's treated as a first-class
feature despite the stratification complexity.
