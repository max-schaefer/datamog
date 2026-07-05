---
title: "Queries"
kind: content
section: "Relational Algebra"
tight: true
---

A query is a nameless rule, so it translates the same way.
Asking what is reachable from one station:

```prolog
?- reach("Taipei Main Station", Y).
```

The constant in column `#1` is a filter; the variable `Y` in column `#2` is what we keep:

<div class="ra">π<sub>#2</sub>( σ<sub>#1 = "Taipei Main Station"</sub>( reach ) )</div>

<div class="note">
Two goals that share all their variables intersect: the handout's <code>?- prime(N), even(N)</code> is <code>prime ∩ even</code>.
Everything that held for rule bodies holds for queries.
</div>
