---
title: "Recap, and where to go next"
kind: content
section: "Wrapping up"
---

- **Pure Datalog** terminates, is decidable, and is polynomial in the data: recursion you can trust. Add negation and arithmetic and questions like containment and emptiness turn undecidable.
- Non-recursive Datalog is exactly **relational algebra**, recursion adds a least fixed point, and that is just `WITH RECURSIVE` in **SQL**.
- Step outside the pure fragment with **arithmetic and strings**, and bring in JSON with the **value** type, at the cost of the termination guarantee.
- The same ideas run real systems: **Soufflé**, **CodeQL**, and **Datomic**.

<div class="note">
Keep going: the language <strong>spec</strong>, the in-browser <strong>playground</strong>, and the <strong>case studies</strong> (theorem proving, program analysis, and more) continue from where these slides end.
</div>
