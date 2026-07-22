---
title: "Multiple rules"
kind: content
section: "Pokémon"
tight: true
---

A predicate may have multiple rules, read as "or" (disjunction):

```datamog
input predicate type(id: integer, type: string).

watery_pokemon(Id) :- type(Id, "water").
watery_pokemon(Id) :- type(Id, "ice").

?- watery_pokemon(Id).
```

- Database view: for each row `(Id, "water")` or `(Id, "ice")` in `type`, add row `(Id)` to `watery_pokemon`.
- Deductive view: if `type(Id, "water")` holds, or `type(Id, "ice")` holds, then `watery_pokemon(Id)` holds.
