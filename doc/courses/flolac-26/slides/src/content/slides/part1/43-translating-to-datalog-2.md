---
title: "Translating propositional logic to Datalog (ctd)"
kind: content
section: "Propositional Logic"
tight: true
---

<div class="clauses">
<span class="clause" data-n="①">(p ∨ ¬q ∨ r)</span> ∧
<span class="clause" data-n="②">(p ∨ ¬q ∨ ¬r)</span> ∧
<span class="clause" data-n="③">(p ∨ q ∨ r)</span>
</div>

A clause holds if **any** literal is true, so it gets **one rule per literal**; `sat` needs **all** clauses at once:

```datamog
val(0).  val(1).
assignment(P, Q, R) :- val(P), val(Q), val(R).

sat_1(P, Q, R) :- assignment(P, Q, R), P = 1.
sat_1(P, Q, R) :- assignment(P, Q, R), Q = 0.
sat_1(P, Q, R) :- assignment(P, Q, R), R = 1.
sat_2(P, Q, R) :- assignment(P, Q, R), P = 1.
sat_2(P, Q, R) :- assignment(P, Q, R), Q = 0.
sat_2(P, Q, R) :- assignment(P, Q, R), R = 0.
sat_3(P, Q, R) :- assignment(P, Q, R), P = 1.
sat_3(P, Q, R) :- assignment(P, Q, R), Q = 1.
sat_3(P, Q, R) :- assignment(P, Q, R), R = 1.
sat(P, Q, R) :- sat_1(P, Q, R), sat_2(P, Q, R), sat_3(P, Q, R).
?- sat(P, Q, R).
```

The query returns all **5 satisfying assignments** of the formula.
