---
title: "Recap: recursion"
kind: content
section: "Recursion"
tight: true
---

- A **recursive** rule refers back to its own predicate: **reachability** on the metro, and **ancestry** in the royal family.
- Datalog runs recursion by **naive evaluation**: iterate the rules to a **least fixed point**, each round growing the **tables** with new **facts**. Mutually recursive predicates grow together, one **SCC** at a time.
- **Negation** is fine across dependency levels (computed lowest first), but not inside a recursive cycle. Stratification is sufficient to guarantee existence of least fixed point (but not necessary).
- Recursion over structure let us **evaluate** any formula from its syntax tree, and **check** its syntax from the text.

<div class="note">
Next: <strong>Part 3</strong> summarises whole groups of results at once, with <strong>aggregates</strong>.
</div>
