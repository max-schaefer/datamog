---
title: "Climbing to the least"
kind: content
section: "Least Fixed Points"
tight: true
---

Naive evaluation starts from `{}` and only adds a fact if there is a rule for it:

- `even(0)` is a fact, which leads to `odd(1)`, which leads to `even(2)`, ...

   Every new fact traces back to `even(0)`.

- `odd(0)` can only come from `even(1)`, which can only come from `odd(0)`, ... 

   Nothing outside the cycle forces it, so starting from `{}` never adds it.

If naive evaluation terminates, it gives us the least fixed point.