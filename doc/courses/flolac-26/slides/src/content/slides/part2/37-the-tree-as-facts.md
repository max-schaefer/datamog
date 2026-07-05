---
title: "The tree, as facts"
kind: content
section: "Beyond CNF"
tight: true
---

<div class="columns">

<img class="graph" style="max-height: calc(var(--u) * 52);" src="/images/formula-tree.svg" alt="Flat top-down syntax-tree diagram on a white background with small rounded rectangular nodes outlined in teal (#2f8576) and thin teal edges (no arrowheads), dark teal node labels (#16433c). Each node is labelled with an (id, kind) pair. The root at the top is '(8, or)', with two children: '(6, and)' on the left and the leaf '(7, var)' on the right. '(6, and)' has children '(4, not)' on the left and the leaf '(5, var)' on the right. '(4, not)' has a single child '(3, or)', which has two leaf children '(1, var)' and '(2, var)'. Beside each var leaf, a small italic teal letter marks the variable it reads: 'p' next to (7, var), 'r' next to (5, var), 'p' next to (1, var) and 'q' next to (2, var)." />

<div>

```prolog
node(1, "var"). node(2, "var").
node(3, "or").  node(4, "not").
node(5, "var"). node(6, "and").
node(7, "var"). node(8, "or").

# pos=0: left child, pos=1: right child
node_child(3, 0, 1). node_child(3, 1, 2).
node_child(4, 0, 3).
node_child(6, 0, 4). node_child(6, 1, 5).
node_child(8, 0, 6). node_child(8, 1, 7).

# 0: p, 1: q, 2: r
node_var(1, 0). node_var(2, 1).
node_var(5, 2). node_var(7, 0).

root(8).
```

</div>

</div>
