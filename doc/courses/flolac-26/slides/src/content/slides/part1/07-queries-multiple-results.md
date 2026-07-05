---
title: "Queries with multiple results"
kind: content
section: "Pokémon"
---

List all Pokémon with 45 HP, or all of them:

```datamog
extensional pokemon(id: integer, name: string, hp: integer).

?- pokemon(_, Name, 45).   # all Pokémon with 45 HP
?- pokemon(_, Name, _).    # all Pokémon in the EDB
```

<div class="note">
<strong>No loops or special syntax needed:</strong> you say <em>what</em> to find, and the engine returns all answers.
</div>
