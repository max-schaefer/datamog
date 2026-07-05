---
title: "A more compact assignment"
kind: content
section: "Propositional Logic"
---

So far an assignment is a tuple `(P, Q, R)`; with more variables the tuple becomes hard to manage.

We store a whole assignment in a single integer, one bit per variable:

<div class="bits">
  <div class="bitcol"><span class="bitcol__n">bit 2</span><span class="bitcol__v">r</span></div>
  <div class="bitcol"><span class="bitcol__n">bit 1</span><span class="bitcol__v">q</span></div>
  <div class="bitcol"><span class="bitcol__n">bit 0</span><span class="bitcol__v">p</span></div>
  <span class="bits__eg"><code>A = 4 = 0b100</code> → r = 1, q = 0, p = 0, i.e. (0, 0, 1)</span>
</div>

```prolog
assignment(A) :- A in [0b000 .. 0b111].
```

<div class="note">
<code>0b…</code> is a binary literal, and <code>X in [lo .. hi]</code> ranges over the integers from <code>lo</code> to <code>hi</code>.

So this one rule lists all eight assignments.
</div>
