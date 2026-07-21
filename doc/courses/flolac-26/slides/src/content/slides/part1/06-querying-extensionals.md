---
title: "Querying extensionals"
kind: content
section: "Pokémon"
---

Query extensional predicates with the `?-` syntax: **check** whether a tuple is present, or **look up** tuples by leaving some components as variables.

```datamog
extensional pokemon(id: integer, name: string, hp: integer).

?- pokemon(1, "Bulbasaur", 45).   # check: yes
```

<div class="note">
A file runs one query; change it to ask another. Swap in <code>?- pokemon(1, "Bulbasaur", 60).</code> (check: no), <code>?- pokemon(Id, "Bulbasaur", 45).</code> (look up the ID by name and HP), <code>?- pokemon(Id, "Bulbasaur", HP).</code> (look up ID and HP), or <code>?- pokemon(Id, "Bulbasaur", _).</code> (look up the ID, ignoring HP).
</div>

<span class="aside">Variables are upper-case by convention; `_` is the special "don't-care" variable.</span>
