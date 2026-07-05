# Exercise 9.3 — Why aggregates can't recurse

The proposed

```prolog
tree_size(Node, count(Child)) :- child(Node, Child).
tree_size(Node, count(Child)) :-
    child(Node, Sub), tree_size(Sub, _), Child = "?".
```

is rejected by Datamog: `tree_size` is both an aggregate predicate
*and* referenced in its own rule body, which is forbidden.

The reason is the same as for negation: `count` is not monotone
(adding a new `child` row *changes* the count, not just adds to
it). Fixed-point iteration only converges for monotone functions;
an aggregate-in-recursion has no well-defined fixed-point
semantics.

## The right way

Split the computation:

```prolog
# Recursive (positive, no aggregate): every node reachable through
# the parent-child relation, including itself.
in_subtree(X, X) :- child(X, _).
in_subtree(X, X) :- child(_, X).
in_subtree(X, D) :- child(X, C), in_subtree(C, D).

# Aggregate stratum on top.
tree_size(X, count(D)) :- in_subtree(X, D).
```

`in_subtree` is plain positive recursion, which is monotone and
fine. `tree_size` is a non-recursive aggregate that reads from
`in_subtree`, which is a different predicate — stratification
handles it. The engine computes `in_subtree` to its fixed point
first, then counts each group.

This pattern — "recurse positively, then aggregate" — is the
standard Datalog move any time you want a size, total, or
min/max over a recursive relation.
