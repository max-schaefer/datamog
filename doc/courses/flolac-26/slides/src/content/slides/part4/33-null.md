---
title: "Missing data is null"
kind: content
section: "JSON"
tight: true
---

Reaching past what is there does not drop the row; it yields `null`.
A missing key and an out-of-range index both give `null`, and `null` keeps spreading as you reach further in:

```datamog
extensional tree(t: value).

kind(T["nope"])            :- tree(T).   # null: no such key
deep(T["args"][9]["name"]) :- tree(T).   # null: index 9 is off the end
internal("yes")            :- tree(T), T["name"] = null.   # branch on null

?- kind(K).
?- internal(X).
```

`null` is one of the `value` shapes, **not** the absence of a row, so every rule still produces a tuple; the last one branches on it with `= null`.

<div class="note">
This safe-navigation <code>null</code> is <strong>Datamog-specific</strong>: standard Datalog has only flat, atomic values and no notion of <code>null</code>.
</div>
