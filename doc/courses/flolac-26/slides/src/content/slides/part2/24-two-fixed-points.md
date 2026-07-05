---
title: "Many fixed points, one least"
kind: content
section: "Least Fixed Points"
tight: true
---

Add one more rule that is also true (`N` is odd when `N + 1` is even):

```datamog
num(0). num(1). num(2). num(3). num(4). num(5).

even(0).
even(N) :- num(N), odd(N - 1).
odd(N)  :- num(N), even(N - 1).
odd(N)  :- num(N), even(N + 1).
```

Now the rules have **two** fixed points over `num = {0, …, 5}`:

| | `even` | `odd` | |
|---|---|---|---|
| ① | `{0, 2, 4}` | `{1, 3, 5}` | all facts tracing back to `even(0)`
| ② | `{0, 1, 2, 3, 4, 5}` | `{0, 1, 2, 3, 4, 5}` | "extra" facts support each other

① is contained in ②, in fact it is the **least** fixed point, our intended answer.
