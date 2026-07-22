---
title: "Exercise: make it symmetric"
kind: content
section: "Recursion"
tight: true
---

Make `reach` **symmetric**: if you can get from one station to another, you can get back again.

```datamog
input predicate line(from: string, to: string).

# as before:
reach(X, Y) :- line(X, Y).
reach(X, Y) :- line(X, Z), reach(Z, Y).

# new:
reach(X, Y) :- reach(Y, X).

?- reach("Taipei Main Station", Y).
```

<div class="note">
This also makes <code>reach</code> reflexive.
</div>
