---
title: "Reachability, recursively"
kind: content
section: "Recursion"
---

With recursion, we need only two rules:

```datamog
input predicate line(from: string, to: string).

reach(X, Y) :- line(X, Y).                 # base case: one stop
reach(X, Y) :- line(X, Z), reach(Z, Y).    # recursive step, along any known path

?- reach("Taipei Main Station", Y). # Ximen, Longshan Temple, Beimen, Zhongshan
```

Second rule is **recursive**: `reach` appears in its own definition.
