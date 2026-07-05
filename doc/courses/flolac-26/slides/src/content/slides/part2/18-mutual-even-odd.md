---
title: "Even and odd, mutually"
kind: content
section: "Naive Evaluation"
tight: true
---

Back to the numbers from Part 1.

There, `even` was defined directly with `% 2`.
Here is a definition that only looks at the **previous** number:

```datamog
extensional num(n: integer).

even(0).
even(N) :- num(N), odd(N - 1).
odd(N)  :- num(N), even(N - 1).

?- even(N).
?- odd(N).
```

- `0` is even.
- `N` is even when `N - 1` is odd, and odd when `N - 1` is even.

<div class="note">
<code>even</code> and <code>odd</code> are <strong>mutually recursive</strong>: each rule calls the other, so neither can be finished first.

They have to be built up together.
</div>
