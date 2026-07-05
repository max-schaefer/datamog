---
title: "Evaluating bodies"
kind: content
section: "From Rules to Answers"
tight: true
---

A **body** is a conjunction of literals (remember: `,` means "and").

Evaluating it finds every binding that satisfies **all** of them: positive atoms generate candidate bindings, comparisons narrow them, and equalities bind new variables.

`divisor(D, N) :- num(D), num(M), D > 1, M > 1, N = D * M`:

<div class="center">

| step | bindings |
| --- | --- |
| `num(D), num(M)` | all 36 `(D, M)` pairs |
| `D > 1, M > 1` | 25 pairs |
| `N = D * M` | `N` computed for each → 25 `(D, N)` facts |

</div>

Each surviving binding instantiates the head, building up the `divisor` relation, one new tuple per binding.
