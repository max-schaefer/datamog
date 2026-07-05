---
title: "Evaluate over the structure"
kind: content
section: "Beyond CNF"
tight: true
---

One rule per kind of node, each evaluating a node from its children:

```prolog
# An assignment A is an N-bit number
assignment(A) :- num_vars(N), A in [0 .. (1 << N) - 1].

# Under assignment A, node N has value V
eval(N, A, V) :- node(N, "var"),  node_var(N, I), assignment(A), V = (A >> I) & 1.
eval(N, A, V) :- node(N, "not"),  node_child(N, 0, C), eval(C, A, VC), V = 1 - VC.
eval(N, A, V) :- node(N, "and"),  eval_children(N, A, L, R), V = L & R.
eval(N, A, V) :- node(N, "or"),   eval_children(N, A, L, R), V = L | R.
eval(N, A, V) :- node(N, "impl"), eval_children(N, A, L, R), V = (1 - L) | R.

# Under assignment A, node N's left child has value LV, and its right child has value RV
eval_children(N, A, LV, RV) :- node_child(N, 0, L), node_child(N, 1, R), eval(L, A, LV), eval(R, A, RV).
```

<div class="note">
<code>eval</code> and <code>eval_children</code> are <strong>mutually recursive</strong>, just like <code>even</code> and <code>odd</code>.

On a single bit, <code>&</code> is AND, <code>|</code> is OR, <code>1 - V</code> is NOT, and <code>p → q</code> is <code>¬p ∨ q</code>.
</div>
