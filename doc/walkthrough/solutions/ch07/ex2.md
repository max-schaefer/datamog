# Exercise 7.2 — Type errors

- **(a)** `emp(name: string, salary: integer)`, then
  `S2 = S + 0.10`. `S` is `integer`; `0.10` is `float`. The
  addition widens to `float`, so `S2` is `float`. The head
  `raise(N, S2)` has columns (`string`, `float`). **Accepted** —
  the tolerated numeric widening.

- **(b)** `both(X) :- a(X), b(X).` — the same variable `X` is
  being unified with `integer` (from `a`) and `string` (from `b`).
  These can't unify. **Rejected** with a column-type conflict.

- **(c)**
  - `expensive(X) :- item(X, P), P > 100.` — `P` is `float`,
    compared against literal `100` (integer, widened to float).
    **Accepted.**
  - `labelled(X) :- item(X, P), P > "threshold".` — `P` is
    `float`, compared against `string`. **Rejected** as incompatible
    comparison types.

Two sub-rules for the same predicate (`expensive` and `labelled`
have different names in the example above — substitute `expensive`
twice and you'd also get a column-type conflict on `labelled`'s
head, since one rule would make the column `string` and the other
`float`).
