---
title: "Intensional layering"
kind: content
section: "Pokémon"
tight: true
---

Predicates build on each other: ability "prankster" adds 1 to a move's priority.

```datamog
extensional learns(name: string, move: string).
extensional move_priority(move: string, priority: integer).
extensional doubles_move(move: string).
extensional protection_move(move: string).
extensional pokemon_ability(name: string, ability: string).

learns_priority(Name, Move, Priority) :-
  learns(Name, Move),
  not doubles_move(Move), not protection_move(Move), Move != "bide",
  move_priority(Move, Priority), Priority > 0.

learns_effective_priority(Name, Move, Priority + 1) :-
  learns_priority(Name, Move, Priority), pokemon_ability(Name, "prankster").

learns_effective_priority(Name, Move, Priority) :-
  learns_priority(Name, Move, Priority), not pokemon_ability(Name, "prankster").

?- learns_effective_priority(Name, Move, Priority).
```
