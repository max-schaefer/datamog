---
title: "Rejected, even when it works"
kind: content
section: "Aggregates"
tight: true
---

The rule is **cautious**: it rejects more than it must.
A tree's **height** is one more than its tallest child.
This needs a recursive `max`, yet the height **does** have a clear answer:

```prolog
height(N, max(H)) :- tchild(N, C), height(C, H0), H = H0 + 1.   # cannot be recursive
```

<div class="columns">

<img class="graph" style="max-height: calc(var(--u) * 28);" src="/images/tree-height.svg" alt="Flat node-and-edge tree diagram on a white background, drawn with white circular nodes outlined in teal and straight teal edges. The root node 'a' sits at top centre with two children below it: 'b' at lower left and 'c' at lower right, and 'b' has a single child 'd' directly beneath it. Node labels are dark teal single letters. To the right of each node an italic teal height annotation reads: 'h = 2' beside the root a, 'h = 1' beside b, 'h = 0' beside the leaf c, and 'h = 0' beside the leaf d." />

<div>

The fix is to **stratify**: first compute the depth of every descendant (child, grandchild, ...), then apply `max` once.

```prolog
depth(N, 0)     :- tnode(N).
depth(N, D + 1) :- tchild(N, C), depth(C, D).
height(N, max(D)) :- depth(N, D).
```

</div>

</div>

<div class="note">
As with negation: the restriction is <strong>sufficient</strong>, not necessary.
</div>
