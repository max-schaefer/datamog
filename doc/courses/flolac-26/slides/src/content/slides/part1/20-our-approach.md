---
title: "Our approach"
kind: content
section: "Find the Thief"
---

Villager data comes from extensionals — our input tables, the initial facts:

```prolog
extensional villager(name: string, age: integer, height: integer).
extensional hairColour(name: string, colour: string).
extensional location(name: string, location: string).
```

We want to define an intensional predicate:

```prolog
suspect(Name) :- villager(Name, _, _), ….
```
