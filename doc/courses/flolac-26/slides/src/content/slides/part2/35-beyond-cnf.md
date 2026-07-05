---
title: "Most formulas aren't CNF"
kind: content
section: "Beyond CNF"
tight: true
---

The Part 1 SAT solver accepted only **CNF**: a flat list of clauses.
Every formula had to be converted first.

The reason was a limitation, not a choice.
A formula is a **tree**, and to evaluate it you must walk that tree, evaluating each node from its children.
Part 1 had **no recursion**, so flattening to CNF was the workaround.

Now we have recursion.
Let's evaluate **any** formula directly, over its structure, starting with the one from Part 1:

<div class="center"><span class="fml">(¬(p ∨ q) ∧ r) ∨ p</span></div>
