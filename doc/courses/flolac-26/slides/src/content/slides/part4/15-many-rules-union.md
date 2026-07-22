---
title: "Many rules, one relation"
kind: content
section: "Relational Algebra"
tight: true
---

The full non-recursive `reach` used one rule for each number of stops.
Each rule is its own expression; the relation is their **union**.

```datamog
input predicate line(from: string, to: string).

reach(X, Y) :- line(X, Y).                 # one stop
reach(X, Y) :- line(X, Z), line(Z, Y).     # two stops

?- reach("Taipei Main Station", Y).        # one or two stops only: not Zhongshan
```

The one-stop rule is just `line` itself (the head keeps both columns, in order). Union it with the two-stop join:

<div class="ra">reach := line ∪ π<sub>#1, #4</sub>( σ<sub>#2 = #3</sub>( line × line ) )</div>

<div class="note">
Several rules for one predicate always combine with <code>∪</code>.
Each rule contributes its tuples, and the relation collects them all.
</div>
