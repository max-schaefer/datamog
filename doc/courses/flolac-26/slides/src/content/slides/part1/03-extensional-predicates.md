---
title: "Extensional predicates"
kind: content
section: "Pokémon"
tight: true
---

**Extensional** predicates are input data for a Datalog program.

Declared like this:

```prolog
input predicate pokemon(id: integer, name: string, hp: integer).
```

Intuitively: `pokemon` lists the `name` and `hp` for each Pokémon, identified by an integer `id`.

- Extensionals model the **entities** we work with (here: Pokémon), often referenced by unique integer IDs.
- They form the **extensional database** (EDB) the program runs on; different runs may use different EDBs.
- We'll look at an extensional two ways: as a **table** (database view) and a set of **facts** (deductive view).
