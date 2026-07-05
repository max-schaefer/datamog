---
title: "Joining tables"
kind: content
section: "Relational Algebra"
tight: true
---

Two body atoms mean two tables.
Reachability in **exactly two stops**, from Part 2's metro:

```prolog
reach(X, Y) :- line(X, Z), line(Z, Y).
```

Pair every edge with every edge, `line × line`: columns `#1 #2` come from the first, `#3 #4` from the second.
The shared variable `Z` forces `#2 = #3`.
The head keeps the endpoints `X` and `Y`, columns `#1` and `#4`:

<div class="ra">reach := π<sub>#1, #4</sub>( σ<sub>#2 = #3</sub>( line × line ) )</div>

<div class="note">
A <strong>join</strong> is product then filter: every variable shared between atoms becomes an equality between the columns it sits in.
</div>
