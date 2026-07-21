---
title: "Queries with multiple results"
kind: content
section: "Pokémon"
---

List all Pokémon (or, by filtering, just those with 45 HP):

```datamog
extensional pokemon(id: integer, name: string, hp: integer).

?- pokemon(_, Name, _).    # all Pokémon in the EDB
```

<div class="note">
<strong>No loops or special syntax needed:</strong> you say <em>what</em> to find, and the engine returns all answers. A file runs one query; change it (say <code>?- pokemon(_, Name, 45).</code>) to ask another.
</div>
