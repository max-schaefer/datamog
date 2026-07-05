---
title: "A running example"
kind: content
section: "From Rules to Answers"
tight: true
---

We'll explain Datalog evaluation using this small program over a set of numbers:

```datamog
extensional num(n: integer).

even(N)       :- num(N), N % 2 = 0.
odd(N)        :- num(N), not even(N).
divisor(D, N) :- num(D), num(M), D > 1, M > 1, N = D * M.
composite(N)  :- divisor(_, N).
not_prime(N)  :- num(N), N = 1.
not_prime(N)  :- composite(N).

?- num(N), not not_prime(N).
```

With input `num = { 1, 2, 3, 4, 5, 6 }` the query returns the primes `{ 2, 3, 5 }`.

It uses extensional data, single- and multi-rule predicates, arithmetic, comparisons, equality, negation, the don't-care `_`, and a conjunctive query.
