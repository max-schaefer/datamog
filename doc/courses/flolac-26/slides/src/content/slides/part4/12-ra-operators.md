---
title: "The operators"
kind: content
section: "Relational Algebra"
tight: true
---

A relation is a whole table, with no variable names: columns are named **by position**, `#1`, `#2`, and so on.
A relation is either given (an extensional table) or **defined** by `R := E`, where `E` uses these operators:

- <code>σ<sub>φ</sub>(R)</code>: keep the rows satisfying a condition φ (**filter**)
- <code>π<sub>cols</sub>(R)</code>: choose or compute columns (**project**)
- <code>R × S</code>: pair every row of R with every row of S
- <code>R ∪ S</code>, <code>R ∩ S</code>, <code>R ∖ S</code>: union, intersection, difference
- <code>γ<sub>col : agg</sub>(R)</code>: group the other columns, then **aggregate**

<div class="note">
Every Datalog feature we have met maps onto these.
The rest of the section is that translation, one construct at a time.
</div>
