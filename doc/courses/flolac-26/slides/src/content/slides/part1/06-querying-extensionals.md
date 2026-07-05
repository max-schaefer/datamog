---
title: "Querying extensionals"
kind: content
section: "Pokémon"
---

Query extensional predicates with the `?-` syntax: **check** whether a tuple is present, or **look up** tuples by leaving some components as variables.

```datamog
extensional pokemon(id: integer, name: string, hp: integer).

?- pokemon(1, "Bulbasaur", 45).   # check: yes
?- pokemon(1, "Bulbasaur", 60).   # check: no
?- pokemon(Id, "Bulbasaur", 45).  # look up Bulbasaur's ID by name and HP
?- pokemon(Id, "Bulbasaur", HP).  # look up Bulbasaur's ID and HP
?- pokemon(Id, "Bulbasaur", _).   # look up Bulbasaur's ID ignoring HP
```

<span class="aside">Variables are upper-case by convention; `_` is the special "don't-care" variable.</span>
