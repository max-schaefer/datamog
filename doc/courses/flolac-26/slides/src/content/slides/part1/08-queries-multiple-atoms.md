---
title: "Queries with multiple atoms"
kind: content
section: "Pokémon"
tight: true
---

Add another extensional listing each Pokémon's types.

Several tuples may share one `id`: a Pokémon can have multiple types.

Query to find Pokémon with both "water" and "ice":

```datamog
input predicate pokemon(id: integer, name: string, hp: integer).
input predicate type(id: integer, type: string).

?- pokemon(Id, Name, _), type(Id, "water"), type(Id, "ice").
```

- Database view: there must be two rows with matching `Id`
- Deductive view: there must be two matching facts

<div class="note">
The comma is <strong>"and"</strong>: every body atom must hold.
</div>
