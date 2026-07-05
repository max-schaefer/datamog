---
title: "More about query answers"
kind: content
section: "Pokémon"
tight: true
---

Let's find Pokémon with high HPs:

```datamog
extensional pokemon(id: integer, name: string, hp: integer).

?- pokemon(_, Name, HP), HP > 150.
```

Each answer provides values for **both** `Name` and `HP` at the same time.

<div class="note">
<strong>Important:</strong> we do <em>not</em> compute one set of possible values for <code>Name</code> and another set of possible values for <code>HP</code>.

<strong>Rather:</strong> we compute <em>pairs</em> of values, one for <code>Name</code> and one for <code>HP</code>, that together answer the query.

<strong>Example:</strong> <code>Name</code> can be <code>Articuno</code> or <code>Lapras</code>, and <code>HP</code> can be 180 or 260, but
<ul>
<li><code>(Articuno, 180)</code> is an answer to the query</li>
<li><code>(Lapras, 180)</code> is not.</li>
</ul>
</div>
