---
title: "A rule is filter, then project"
kind: content
section: "Relational Algebra"
tight: true
---

Take the handout's first rule: the adults in a `person` table.

```prolog
adult(Name) :- person(Name, Age), Age >= 18.
```

The single body atom **is** the table `person`.
The comparison `Age >= 18` keeps some rows, a **filter** σ.
The head keeps only the name, column `#1`, a **projection** π:

<div class="ra">adult := π<sub>#1</sub>( σ<sub>#2 ≥ 18</sub>( person ) )</div>

<div class="note">
Read it inside out: filter <code>person</code> down to the adult rows, then project onto the name.
Columns are positional, so <code>Age</code> is <code>#2</code>.
</div>
