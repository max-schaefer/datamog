---
title: "Another intensional predicate"
kind: content
section: "Pokémon"
---

Which moves can a Pokémon learn that have **priority** (used before slower moves in the same turn)?

```datamog
input predicate learns(name: string, move: string).
input predicate move_priority(move: string, priority: integer).

learns_priority(Name, Move, Priority) :-
  learns(Name, Move), move_priority(Move, Priority), Priority > 0.

?- learns_priority(Name, Move, Priority).
```
