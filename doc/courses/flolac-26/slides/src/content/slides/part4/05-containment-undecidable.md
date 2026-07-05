---
title: "Why containment is undecidable"
kind: content
section: "Metatheory"
tight: true
---

Read a Datalog program as a generalised **grammar**: a binary predicate is a nonterminal, a chain rule is a production.

```prolog
s(X, Y) :- a(X, Z), b(Z, Y).   #  S → A B
```

This captures every **context-free language** (the Part 2 parser was one such grammar).
So asking `P₁ ⊑ P₂` becomes asking "is grammar `G₁`'s language inside `G₂`'s?".

<div class="note">
Context-free language containment is famously <strong>undecidable</strong> — no algorithm settles it for every pair of grammars. The reduction carries that straight to Datalog: containment, and hence equivalence, is undecidable.
</div>
