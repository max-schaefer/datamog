---
title: "Recursion is a least fixed point"
kind: content
section: "Relational Algebra"
tight: true
---

Recursive `reach` replaces the second `line` with `reach` itself:

```datamog
input predicate line(from: string, to: string).

reach(X, Y) :- line(X, Y).
reach(X, Y) :- line(X, Z), reach(Z, Y).

?- reach("Taipei Main Station", Y).        # now reaches Zhongshan too
```

<div class="ra">reach := line ∪ π<sub>#1, #4</sub>( σ<sub>#2 = #3</sub>( line × reach ) )</div>

Now `reach` appears on **both** sides: an **equation**, not a definition.
Solve it by **naive evaluation** as in Part 2 — from `reach = {}`, apply the right-hand side until it stops growing, at the **least fixed point**.

<div class="note">
This is the one thing relational algebra needs beyond the basic operators, and exactly what SQL spells <code>WITH RECURSIVE</code>.
</div>
