---
title: "Further refinements"
kind: content
section: "Pokémon"
tight: true
---

Adding conditions means adding body literals.

Also rule out protection moves:

```datamog
extensional learns(name: string, move: string).
extensional move_priority(move: string, priority: integer).
extensional doubles_move(move: string).
extensional protection_move(move: string).

learns_priority(Name, Move, Priority) :-
  learns(Name, Move),
  not doubles_move(Move),
  not protection_move(Move),
  Move != "bide",
  move_priority(Move, Priority),
  Priority > 0.

?- learns_priority(Name, Move, Priority).
```
