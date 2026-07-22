---
title: "Our approach"
kind: content
section: "Find the Thief"
---

Villager data comes from extensionals — our input tables, the initial facts:

```prolog
input predicate villager(name: string, age: integer, height: integer).
input predicate hairColour(name: string, colour: string).
input predicate location(name: string, location: string).
```

We want to define an intensional predicate:

```prolog
suspect(Name) :- villager(Name, _, _), ….
```
