---
title: "One summary per group"
kind: content
section: "Aggregates"
tight: true
---

A non-aggregate head argument splits the rows into **groups**: one summary per distinct value.

For example, we can count how many literals are negated in each clause `C` in our CNF example:

```prolog
count_neg(C, count(*)) :- literal(C, _, 0).
```

This works as follows:

1. Evaluate the body of the predicate; the result is a set of rows, one per negated literal.
2. For each `C`, add a row `(C, n)` to `count_neg`, where `n` is the number of those rows with that `C`.
