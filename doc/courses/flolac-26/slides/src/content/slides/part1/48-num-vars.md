---
title: "More or fewer variables"
kind: content
section: "Propositional Logic"
---

Nothing above is tied to three variables.

Make the variable count data too, and size `var` and `assignment` from it:

```prolog
input predicate num_vars(n: integer).

var(V)        :- num_vars(N), V in [0 .. N - 1].
assignment(A) :- num_vars(N), A in [0 .. (1 << N) - 1].
```

<div class="note">
With <code>num_vars(N)</code> there are <code>N</code> variables and <code>2^N</code> assignments (<code>1 << N</code> of them).

The interpreter rules stay the same; only the formula and <code>num_vars</code> are supplied as input.
</div>
