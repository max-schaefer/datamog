---
title: "Facts"
kind: content
section: "Pokémon"
---

An empty rule body can be omitted; such rules are called **facts**:

```datamog
my_team("Bulbasaur").
my_team("Kabutops").
my_team("Tornadus").

?- my_team(Name).
```

Like an extensional predicate, but part of the IDB (program), not the EDB (input).
