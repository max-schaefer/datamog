---
title: "Question 1"
kind: content
section: "Find the Thief"
tight: true
---

Is the thief taller than 150 cm? **Yes.**

```datamog
input predicate villager(name: string, age: integer, height: integer).

suspect(Name) :- villager(Name, _, Height),
                 Height > 150.

?- suspect(X).
```

<div class="note">A new table <code>suspect</code>, built by filtering <code>villager</code> to those with <code>Height &gt; 150</code>.</div>
