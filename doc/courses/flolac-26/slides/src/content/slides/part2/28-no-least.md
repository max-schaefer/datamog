---
title: "Two fixed points, no least"
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

These rules again have **two** fixed points over `num = {0, …, 5}`:

| | `even` | `odd` | |
|---|---|---|---|
| ① | `{0, 1, 2, 3, 4, 5}` | `{}` | everyone is even, no one is odd
| ② | `{}` | `{0, 1, 2, 3, 4, 5}` | everyone is odd, no one is even

- Neither of these fixed points is contained in the other.
- Nothing sits below both ① and ②, so there is <strong>no</strong> least fixed point and no obviously correct answer.
- That is why Datamog rejects the program.
