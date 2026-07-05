---
title: "Question 4"
kind: content
section: "Find the Thief"
tight: true
---

Is the thief younger than 30? **No.**

```datamog
extensional villager(name: string, age: integer, height: integer).
extensional hairColour(name: string, colour: string).

bald(Name) :- villager(Name, _, _), not hairColour(Name, _).

suspect(Name) :- villager(Name, Age, Height),
                 Height > 150,
                 not hairColour(Name, "blond"),
                 not bald(Name),
                 not Age < 30.

?- suspect(X).
```
