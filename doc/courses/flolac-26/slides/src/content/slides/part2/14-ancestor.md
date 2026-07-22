---
title: "Ancestors, recursively"
kind: content
section: "Crown the Rightful Heir"
tight: true
---

An **ancestor** is a parent, or a parent of an ancestor: the transitive closure of `parent`, exactly the shape of `reach`:

```datamog
input predicate parent(parent: string, child: string).

ancestor(X, Y) :- parent(X, Y).                  # base case
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).  # recursive step

?- ancestor(A, "carol").    # "bob", "edmund", "basil": Carol's ancestors up to the king
```
