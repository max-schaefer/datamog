---
title: "Question 7"
kind: content
section: "Find the Thief"
tight: true
---

Is the thief taller than 180 cm and shorter than 190 cm? **No.**

```datamog
extensional villager(name: string, age: integer, height: integer).
extensional hairColour(name: string, colour: string).
extensional location(name: string, location: string).

bald(Name) :- villager(Name, _, _), not hairColour(Name, _).
dark("black"). dark("brown").
height18x(Name) :- villager(Name, _, Height), Height > 180, Height < 190.

suspect(Name) :- villager(Name, Age, Height),
                 Height > 150,
                 not hairColour(Name, "blond"),
                 not bald(Name),
                 not Age < 30,
                 location(Name, "east"),
                 hairColour(Name, Colour), dark(Colour),
                 not height18x(Name).

?- suspect(X).
```
