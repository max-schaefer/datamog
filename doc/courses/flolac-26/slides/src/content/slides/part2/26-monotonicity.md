---
title: "Monotonicity"
kind: content
section: "Least Fixed Points"
tight: true
---

Consider a rule containing an atom referencing a predicate `p`:

```prolog
r(X, Y, Z) :- ..., p(X, Y), ...
```

We call the rule **monotone in `p`** if a larger `p` gives us a larger `r`.

A program is **monotone** if all recursive rules are monotone in all recursive predicates.

<div class="note">
<strong>Knaster-Tarski Theorem</strong>: Each monotone program has a least fixed point.
</div>

<div class="note">
<strong>Kleene Fixed-Point Theorem</strong>: For monotone programs in pure Datalog, naive evaluation terminates with the least fixed point.
</div>
