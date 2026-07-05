# Exercise 7.1 — Which rules are safe?

- **(a) `a1(X, Y) :- edge(X, Y), Y > X.`** — **Safe.** `X` and `Y`
  are bound by `edge(X, Y)`; the comparison filters.
- **(b) `a2(X, Z) :- edge(X, Y), Z = Y + 1.`** — **Safe.** `X`, `Y`
  bound by `edge`; `Z` bound via equality to a safe expression.
- **(c) `a3(X, Y) :- Y > X, edge(X, _).`** — **Unsafe.** `Y`
  appears in the head and in the comparison, but no positive body
  atom binds it. (The fix is to add `edge(Y, _)` or `Y in
  [...]`.)
- **(d) `a4(N, M) :- N in [0..10], M = N * N.`** — **Safe.** The
  range binds `N`; the equality then binds `M`.
- **(e) `a5(X, Y) :- edge(X, _), edge(_, Y), X = Y.`** — **Safe.**
  Both `X` and `Y` are bound by their respective `edge` atoms;
  `X = Y` is a filter that both occurrences must agree on.
