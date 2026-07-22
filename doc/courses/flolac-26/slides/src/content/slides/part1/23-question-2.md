---
title: "Question 2"
kind: content
section: "Find the Thief"
tight: true
---

Does the thief have blond hair? **No.**

```datamog
input predicate villager(name: string, age: integer, height: integer).
input predicate hairColour(name: string, colour: string).

suspect(Name) :- villager(Name, _, Height),
                 Height > 150,
                 not hairColour(Name, "blond").

?- suspect(X).
```
