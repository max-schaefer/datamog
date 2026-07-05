---
title: "Two relations at once"
kind: content
section: "Relational Algebra"
tight: true
---

Mutual recursion gives a **system** of equations.
The even and odd numbers from Part 2:

```prolog
even(0).
even(N) :- num(N), odd(N - 1).
odd(N)  :- num(N), even(N - 1).
```

<div class="ra">even := { (0) } ∪ π<sub>#1</sub>( σ<sub>#2 = #1 - 1</sub>( num × odd ) )<br>odd&nbsp; := π<sub>#1</sub>( σ<sub>#2 = #1 - 1</sub>( num × even ) )</div>

The fact `even(0)` becomes the constant table `{ (0) }`.
Both equations are solved **together**, iterating from `even = odd = {}` until neither changes.

<div class="note">
A whole strongly connected component becomes one simultaneous least fixed point, just as in naive evaluation.
</div>
