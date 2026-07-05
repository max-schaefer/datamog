---
title: "Where decidability returns"
kind: content
section: "Metatheory"
tight: true
---

Undecidability is a statement about the **full** language.
Restrict the shape and the questions become decidable again.
A few cases:

- **Monadic intensionals**: every rule-defined predicate is **unary**. Containment is decidable; this is *monadic Datalog*.
- **Monadic extensionals**: the input predicates are all **unary**.
- **No recursion**: a non-recursive program is a union of conjunctive queries, where containment is decidable.

<div class="note">
Expressive power and decidable reasoning pull against each other.
A restricted fragment regains whichever property matters more for the task at hand.
</div>
