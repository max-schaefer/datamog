---
title: "A propositional logic interpreter"
kind: content
section: "Propositional Logic"
tight: true
---

One fixed set of rules solves any CNF.
No separate predicate per clause is needed:

```datamog
input predicate literal(clause: integer, var: integer, polarity: integer).

assignment(A) :- A in [0b000 .. 0b111].
var(V)        :- V in [0 .. 2].
lookup(A, V, B) :- assignment(A), var(V), B = (A >> V) & 1.

clause(C)              :- literal(C, _, _).
satisfies_clause(A, C) :- assignment(A), literal(C, V, Pol), lookup(A, V, Pol).
falsifies(A)           :- assignment(A), clause(C), not satisfies_clause(A, C).
satisfies(A)           :- assignment(A), not falsifies(A).

?- satisfies(A).
```

<div class="note">
A clause is satisfied when one of its literals is true (its variable's value matches the polarity, via <code>lookup</code>).

An assignment <strong>falsifies</strong> the formula if some clause is left unsatisfied.

<code>satisfies</code> yields <code>0b001, 0b011, 0b100, 0b101, 0b111</code>.
</div>
