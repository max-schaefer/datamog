---
title: "Datalog is relational algebra plus recursion"
kind: content
section: "Relational Algebra"
tight: true
---

Every construct landed on the same handful of operators:

- a rule body: a product `×`, filtered by `σ`, projected by `π`
- several rules: union `∪`; negation: difference `∖`; a query: more of the same
- aggregates: `γ`

So **non-recursive Datalog is exactly relational algebra**, the core of SQL.
Read the other way, each rule still says: if the body facts hold, **derive** the head — the deductive view RA leaves implicit.
Recursion adds one thing: a **least fixed point**, reached by the naive evaluation of Part 2, and written `WITH RECURSIVE` in SQL.

<div class="note">
This is how Datamog's SQL backends run, and why <code>SQL</code> sits just inside Datalog on the spectrum.
It also explains the complexity result: relational algebra is cheap, and the fixed point adds only polynomial cost, so pure Datalog stays in <strong>P</strong>.
</div>
