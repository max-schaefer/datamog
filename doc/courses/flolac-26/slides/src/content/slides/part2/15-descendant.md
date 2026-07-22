---
title: "Descendants for no extra work"
kind: content
section: "Crown the Rightful Heir"
tight: true
---

A **descendant** is an ancestor read backwards, so we flip the arguments:

```datamog
input predicate parent(parent: string, child: string).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

descendant(X, Y) :- ancestor(Y, X).   # an ancestor, backwards

?- descendant(X, "basil").   # everyone descended from the king
```

<div class="note">
This yields all ten of Basil's descendants.
The same recursive <code>ancestor</code> answers ancestry <strong>and</strong> descent, by swapping its arguments.
</div>
