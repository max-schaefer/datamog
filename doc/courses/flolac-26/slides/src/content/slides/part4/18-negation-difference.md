---
title: "Negation is difference"
kind: content
section: "Relational Algebra"
tight: true
---

A negated atom removes rows.
The eligible heirs from Part 2, dropping anyone with a criminal record:

```prolog
eligible_heir(X) :- living_descendant(X), not criminal(X).
```

Both `living_descendant` and `criminal` are tables of names.
Keeping the descendants who are **not** criminals is a **set difference**:

<div class="ra">eligible_heir := living_descendant ∖ criminal</div>

<div class="note">
Difference needs its right-hand table <strong>complete</strong> before it runs.
That is why negation must be <strong>stratified</strong>: finish <code>criminal</code> first, then subtract.
</div>
