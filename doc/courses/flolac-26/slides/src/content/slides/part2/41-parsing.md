---
title: "Parsing a formula"
kind: content
section: "Parsing"
tight: true
---

A formula is **text**, turned into relations: one row per character, plus its length and the variable alphabet.

```prolog
extensional char(idx: integer, char: string).
extensional len(n: integer).
extensional prop_var(name: string).
```

For `p&q` we have:

```
char     = { (0, "p"), (1, "&"), (2, "q") }
len      = { 3 }
prop_var = { "p", "q", "r" }
```

For each expression type `e`, we define an intensional predicate `e(F, T)` meaning "the characters at positions `F .. T-1` form an expression of type `e`".

