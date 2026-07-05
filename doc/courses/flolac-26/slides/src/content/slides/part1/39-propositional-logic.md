---
title: "Propositional logic"
kind: content
section: "Propositional Logic"
tight: true
---

- Formulas composed of **propositional variables** (<span class="fml">p, q, r, …</span>), **negation** (<span class="fml">¬</span>) and **connectives** (<span class="fml">∧, ∨, →, ↔</span>):
  - <span class="fml">(¬(p ∨ q) ∧ r) ∨ p</span>
  - <span class="fml">((p → q) → p) → p</span>
- **Classical logic:** an assignment of true/false to the variables fixes whether a formula is true or false.<br>For <span class="fml">(¬(p ∨ q) ∧ r) ∨ p</span>:
  - <span class="fml">p = true, q = false, r = false</span> makes it **true**: a **satisfying assignment**
  - <span class="fml">p = false, q = false, r = false</span> makes it **false**: a **counterexample**
- **Satisfiable** formulas have satisfying assignments, **valid** formulas have no counterexamples:
  - <span class="fml">(¬(p ∨ q) ∧ r) ∨ p</span> is **satisfiable**
  - <span class="fml">((p → q) → p) → p</span> is **valid**
