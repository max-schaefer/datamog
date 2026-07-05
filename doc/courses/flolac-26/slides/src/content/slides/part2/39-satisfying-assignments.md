---
title: "Satisfying and falsifying assignments"
kind: content
section: "Beyond CNF"
tight: true
---

The root's value decides everything:

```prolog
satisfies(A)  :- root(R), eval(R, A, 1).
satisfiable() :- satisfies(_).

falsifies(A)  :- root(R), eval(R, A, 0).
valid()       :- not falsifies(_).
```

- For <span class="fml">(¬(p ∨ q) ∧ r) ∨ p</span>, `satisfies` returns the **same five** assignments as Part 1's CNF solver: `0b001, 0b011, 0b100, 0b101, 0b111`. No CNF needed.
- A valid formula like <span class="fml">((p → q) → p) → p</span> has no counterexample, so `valid` is `yes`.

<div class="note">
One machine, any formula.
Recursion over the tree did the same work that flattening to CNF did before, but for formulas of every shape.
</div>
