---
title: "Question 6"
kind: content
section: "Find the Thief"
tight: true
---

Does the thief have dark hair? **Yes.**

```datamog
input predicate villager(name: string, age: integer, height: integer).
input predicate hairColour(name: string, colour: string).
input predicate location(name: string, location: string).

bald(Name) :- villager(Name, _, _), not hairColour(Name, _).
dark("black"). dark("brown").

suspect(Name) :- villager(Name, Age, Height),
                 Height > 150,
                 not hairColour(Name, "blond"),
                 not bald(Name),
                 not Age < 30,
                 location(Name, "east"),
                 hairColour(Name, Colour), dark(Colour).

?- suspect(X).
```
