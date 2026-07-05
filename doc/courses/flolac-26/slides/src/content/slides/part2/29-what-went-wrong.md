---
title: "What went wrong?"
kind: content
section: "Least Fixed Points"
tight: true
---

```datamog
num(0). num(1). num(2). num(3). num(4). num(5).

even(N) :- num(N), not odd(N).
odd(N)  :- num(N), not even(N).

?- even(N).
```

The rule for `even` is not monotone in `odd` (and vice versa):

| input `odd` | output `even` |
|---|---|
| `{}` | `{0, 1, 2, 3, 4, 5}` |
| `{0, 1, 2, 3, 4, 5}` | `{}` |

In general, if each use of `p` in a rule is positive (i.e., not negated), the rule is monotone in `p`.

So if all recursive calls in a program are positive, the program is monotone.