---
title: "Variant: doubly recursive"
kind: content
section: "Recursion"
---

The step can even mention `reach` **twice**, joining one journey after another:

```datamog
input predicate line(from: string, to: string).

reach(X, Y) :- line(X, Y).                 # base case
reach(X, Y) :- reach(X, Z), reach(Z, Y).   # doubly recursive step

?- reach("Taipei Main Station", Y).
```

<div class="note">
Still the <strong>same rounds</strong>, the same eight pairs.

Two recursive calls, and it <strong>still</strong> terminates, even with the cycle: bottom-up evaluation only ever adds tuples, and the relation must be finite.
</div>
