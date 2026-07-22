---
title: "Question 3"
kind: content
section: "Find the Thief"
tight: true
---

Is the thief bald? **No.**

```datamog
input predicate villager(name: string, age: integer, height: integer).
input predicate hairColour(name: string, colour: string).

bald(Name) :- villager(Name, _, _), not hairColour(Name, _).

suspect(Name) :- villager(Name, _, Height),
                 Height > 150,
                 not hairColour(Name, "blond"),
                 not bald(Name).

?- suspect(X).
```
