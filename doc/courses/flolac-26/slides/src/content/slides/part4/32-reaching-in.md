---
title: "Reaching into a tree"
kind: content
section: "JSON"
tight: true
---

Subscripts reach **into** a value: a key picks an object's field, a position picks an array element.
Given a tree `T`:

```datamog
extensional tree(t: value).

kind(T["type"])                 :- tree(T).   # "and"
left(T["args"][0])              :- tree(T).   # {"type": "var", "name": "p"}
left_name(T["args"][0]["name"]) :- tree(T).   # "p"

?- kind(K).
?- left_name(N).
```

<div class="note">
Keys and indices <strong>compose</strong>, so a path like <code>T["args"][0]["name"]</code> walks straight down the tree.
</div>
