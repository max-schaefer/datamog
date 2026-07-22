---
title: "One rule, many questions"
kind: content
section: "Recursion"
---

The same `reach` predicate answers questions in every direction. A file
runs one query; change it to ask each one:

```datamog
input predicate line(from: string, to: string).
reach(X, Y) :- line(X, Y).
reach(X, Y) :- line(X, Z), reach(Z, Y).

?- reach("Taipei Main Station", Y).             # where can I get to?
```

<div class="note">
We describe <em>what</em> a path is, once, and the engine searches in the
direction the question needs. Swap in <code>?- reach(X, "Zhongshan").</code>
(which stations reach Zhongshan?),
<code>?- reach("Taipei Main Station", "Zhongshan").</code> (yes/no), or
<code>?- reach(X, Y).</code> (every reachable pair) to ask the others.
</div>
