---
title: "Reading a variable"
kind: content
section: "Propositional Logic"
tight: true
---

`var(V)` lists the valid variable indices; `lookup(A, V, B)` reads variable `V`'s value out of an assignment:

```datamog
assignment(A) :- A in [0b000 .. 0b111].

var(V)          :- V in [0 .. 2].             # variables p, q, r are 0, 1, 2
lookup(A, V, B) :- assignment(A), var(V), B = (A >> V) & 1.

?- lookup(0b101, 0, B).   # B = 1  (variable 0, p, is true)
```

<div class="note">
A file runs one query; change it to ask another. Swap in <code>?- lookup(0b101, 1, B).</code> to read variable 1 (q): B = 0 (false).
</div>
