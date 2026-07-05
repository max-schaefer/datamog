---
title: "One rule, many questions"
kind: content
section: "Recursion"
---

The same `reach` predicate answers questions in every direction:

```datamog
extensional line(from: string, to: string).
reach(X, Y) :- line(X, Y).
reach(X, Y) :- line(X, Z), reach(Z, Y).

?- reach("Taipei Main Station", Y).             # where can I get to?
?- reach(X, "Zhongshan").                       # which stations reach Zhongshan?
?- reach("Taipei Main Station", "Zhongshan").   # yes/no: is Zhongshan reachable?
?- reach(X, Y).                                 # every reachable pair
```

<div class="note">
We describe <em>what</em> a path is, once, and the engine searches in the direction the question needs.
</div>
