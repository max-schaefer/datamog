---
title: "Computing a value from the data itself"
kind: content
section: "Aggregates"
tight: true
---

In the formula evaluator from Part 2, we had two extensionals:

```prolog
extensional node_var(id: integer, idx: integer).
extensional num_vars(n: integer).
```

Using `max`, we can derive the second from the first:

```prolog
highest_index(max(I)) :- node_var(_, I).
num_vars(N)           :- highest_index(M), N = M + 1.
```

This works as follows:

1. `highest_index` takes the **largest** index `I` over every `node_var` row.
2. Indices start at `0`, so there are `M + 1` variables.

<div class="note">
Multiple nodes can have the same variable, so <code>count(*)</code> would give the wrong result!
</div>
