---
title: "Translating propositional logic to Datalog"
kind: content
section: "Propositional Logic"
tight: true
---

<div class="note">
To find a formula's satisfying assignments, <strong>enumerate all assignments</strong> and keep those that satisfy it.

By safety, a comparison can only <strong>test</strong> already-<strong>bound</strong> variables, so we first <strong>generate</strong> every assignment (binding <code>P</code>, <code>Q</code>, <code>R</code>), then let the clauses test them.
</div>

`val` holds the two truth values (`0` = false, `1` = true); `assignment` builds all 2³ = 8 assignments of `(p, q, r)`:

```datamog
val(0).  val(1).

assignment(P, Q, R) :- val(P), val(Q), val(R).

?- assignment(1, 0, 0).   # p = true, q = false, r = false is an assignment
```

<div class="note">
A file runs one query; change it to ask another. Swap in <code>?- assignment(1, Q, R).</code> for all 4 assignments where p = true.
</div>
