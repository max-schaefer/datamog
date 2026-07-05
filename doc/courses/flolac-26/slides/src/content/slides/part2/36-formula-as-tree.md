---
title: "A formula is a tree"
kind: content
section: "Beyond CNF"
tight: true
---

<div class="center"><span class="fml">(¬(p ∨ q) ∧ r) ∨ p</span></div>

<div class="columns">

<img class="graph" style="max-height: calc(var(--u) * 52);" src="/images/formula-tree.svg" alt="Flat top-down syntax-tree diagram on a white background with small rounded rectangular nodes outlined in teal (#2f8576) and thin teal edges (no arrowheads), dark teal node labels (#16433c). Each node is labelled with an (id, kind) pair. The root at the top is '(8, or)', with two children: '(6, and)' on the left and the leaf '(7, var)' on the right. '(6, and)' has children '(4, not)' on the left and the leaf '(5, var)' on the right. '(4, not)' has a single child '(3, or)', which has two leaf children '(1, var)' and '(2, var)'. Beside each var leaf, a small italic teal letter marks the variable it reads: 'p' next to (7, var), 'r' next to (5, var), 'p' next to (1, var) and 'q' next to (2, var)." />

<div>

```prolog
extensional node(id: integer, kind: string).
extensional node_child(id: integer,
                       pos: integer, child: integer).
extensional node_var(id: integer, idx: integer).
extensional root(id: integer).
```

- `node` specifies node kinds (`and`, `or`, `not`, `var`).
- `node_child` links a parent to its children.
- `node_var` selects which variable each `var` reads.
- `root` marks the top (id 8).

</div>

</div>
