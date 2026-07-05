---
title: "Linear and non-linear recursion"
kind: content
section: "Metatheory"
tight: true
---

A recursive rule is **linear** when its body mentions the recursive predicate **at most once**.
Transitive closure, two ways:

```prolog
# linear: reach appears once in the recursive rule
reach(X, Y) :- edge(X, Y).
reach(X, Y) :- edge(X, Z), reach(Z, Y).

# non-linear: reach appears twice
reach(X, Y) :- edge(X, Y).
reach(X, Y) :- reach(X, Z), reach(Z, Y).
```

Both compute the same relation.
SQL's `WITH RECURSIVE` allows only the **linear** shape, so the **non-linear** version runs only on Datamog's in-memory evaluation, like the formula evaluator and parser in Part 2.

<div class="note">
Linear recursion is also the parallel-friendly case.
Yet some queries are non-linear by nature: no linear program can compute them.
</div>
