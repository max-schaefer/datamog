---
title: "Logical equivalences"
kind: content
section: "Propositional Logic"
tight: true
---

Two formulas are **equivalent** (<span class="fml">≡</span>) when they have the same truth value under every assignment.

A few classical equivalences rewrite any formula without changing its meaning:

- **Involution** (double negation): <span class="fml">¬¬p ≡ p</span>
- **De Morgan**: <span class="fml">¬(p ∧ q) ≡ ¬p ∨ ¬q</span> and <span class="fml">¬(p ∨ q) ≡ ¬p ∧ ¬q</span>
- **Distributivity**: <span class="fml">p ∧ (q ∨ r) ≡ (p ∧ q) ∨ (p ∧ r)</span> and <span class="fml">p ∨ (q ∧ r) ≡ (p ∨ q) ∧ (p ∨ r)</span>
- **Law of excluded middle** (LEM): <span class="fml">p ∨ ¬p</span> always holds, so <span class="fml">q ∧ (p ∨ ¬p) ≡ q</span>
- **Law of non-contradiction** (LNC): <span class="fml">p ∧ ¬p</span> never holds, so <span class="fml">q ∨ (p ∧ ¬p) ≡ q</span>

<div class="note">
De Morgan and involution <strong>push negation inward</strong> to the variables.
<br>
Distributivity <strong>expands the formula into a conjunction of disjunctions</strong> (or the reverse).
<br>
LEM and LNC <strong>add missing variables</strong>.
</div>
