---
title: "Soufflé"
kind: content
section: "Real Systems"
tight: true
---

- An open-source Datalog engine that **compiles** rules to parallel C++ with **semi-naive** evaluation, for speed on very large inputs.
- The language is the Datalog you know; transitive closure reads almost the same, with type-annotated declarations:

```prolog
.decl edge(x: number, y: number)
.decl path(x: number, y: number)
path(x, y) :- edge(x, y).
path(x, z) :- path(x, y), edge(y, z).
.output path
```

- Its main use is **static program analysis**: the Doop framework runs whole-program points-to analysis for Java entirely in Soufflé rules.

<div class="note">
The Metatheory promise made real: pure recursive rules, polynomial in the data, compiled for scale.
</div>
