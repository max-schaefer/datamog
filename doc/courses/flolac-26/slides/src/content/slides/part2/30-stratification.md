---
title: "Stratifiability"
kind: content
section: "Least Fixed Points"
tight: true
---

- A predicate `P` **depends** on a predicate _Q_ if some atom _A_ in a rule of _P_ refers to _Q_.

   If that atom is negated, `P` **negatively depends** on _Q_, otherwise it **positively depends** on _Q_.
- A **stratification** assigns a natural number <em>L<sub>P</sub></em> (the _level_ of _P_) to every predicate _P_ such that

   1. No _P_ depends on a _Q_ at a higher level, i.e., <em>L<sub>P</sub> &lt; L<sub>Q</sub></em>
   2. No _P_ negatively depends on a _Q_ at the same level, i.e., <em>L<sub>P</sub> = L<sub>Q</sub></em>

   If a program has (at least) one stratification ("**stratifiable**"), it has a least fixed point.
- Datamog checks whether there is a stratification:

   - If there is, it applies naive evaluation to each group of predicates with the same level, starting from the lowest
   - If there is not, the program is rejected
