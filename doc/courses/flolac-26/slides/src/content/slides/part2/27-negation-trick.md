---
title: "A tempting shortcut"
kind: content
section: "Least Fixed Points"
tight: true
---

Why bother with `N - 1`? Define each predicate as the negation of the other:

```datamog
num(0).  num(1).  num(2).  num(3).

even(N) :- num(N), not odd(N).
odd(N)  :- num(N), not even(N).

?- even(N).
```

Run naive evaluation and it never settles:

- **Round 1:** both relations are empty, so `not` holds everywhere; both become **all** of `num`.
- **Round 2:** now both are full, so `not` holds **nowhere**; both become **empty**.
- Round 3 fills them again: it flips forever, never stable.

<div class="note">
Naive evaluation does not terminate here, and Datamog rejects the program before it even starts.
</div>
