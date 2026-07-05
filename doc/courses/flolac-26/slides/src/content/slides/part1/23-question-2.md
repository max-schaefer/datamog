---
title: "Question 2"
kind: content
section: "Find the Thief"
tight: true
---

Does the thief have blond hair? **No.**

```datamog
extensional villager(name: string, age: integer, height: integer).
extensional hairColour(name: string, colour: string).

suspect(Name) :- villager(Name, _, Height),
                 Height > 150,
                 not hairColour(Name, "blond").

?- suspect(X).
```
