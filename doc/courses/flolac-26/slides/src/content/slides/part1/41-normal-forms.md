---
title: "Normal forms"
kind: content
section: "Propositional Logic"
tight: true
---

**Disjunctive normal form (DNF)**: push negation and conjunction inward, add missing variables:

<pre class="deriv">  (¬(p ∨ q) ∧ r) ∨ p
≡ (<mark class="mark">¬p ∧ ¬q</mark> ∧ r) ∨ p
≡ (¬p ∧ ¬q ∧ r) ∨ <mark class="mark">(p ∧ (q ∨ ¬q) ∧ (r ∨ ¬r))</mark>
≡ (¬p ∧ ¬q ∧ r) ∨ <mark class="mark">(p ∧ q ∧ r) ∨ (p ∧ q ∧ ¬r) ∨ (p ∧ ¬q ∧ r) ∨ (p ∧ ¬q ∧ ¬r)</mark></pre>

**Conjunctive normal form (CNF)**: push negation and disjunction inward, add missing variables:

<pre class="deriv">  (¬(p ∨ q) ∧ r) ∨ p
≡ (<mark class="mark">¬p ∧ ¬q</mark> ∧ r) ∨ p
≡ <mark class="mark">(¬p ∨ p) ∧ (p ∨ ¬q) ∧ (p ∨ r)</mark>
≡ (p ∨ ¬q ∨ <mark class="mark">(r ∧ ¬r)</mark>) ∧ (p ∨ <mark class="mark">(q ∧ ¬q)</mark> ∨ r)
≡ (p ∨ ¬q ∨ r) ∧ (p ∨ ¬q ∨ ¬r) ∧ (p ∨ q ∨ r) ∧ <mark class="mark">(p ∨ ¬q ∨ r)</mark>
≡ (p ∨ ¬q ∨ r) ∧ (p ∨ ¬q ∨ ¬r) ∧ (p ∨ q ∨ r)</pre>
