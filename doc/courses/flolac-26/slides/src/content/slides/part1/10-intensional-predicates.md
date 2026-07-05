---
title: "Intensional predicates"
kind: content
section: "Pokémon"
tight: true
---

**Intensional** predicates express computations by means of **rules**, which look like named queries:

<div class="rule">
  <span class="rule__part rule__part--head" data-label="Head">strong_pokemon(<span class="tk-var">Name</span>)</span>
  <span class="rule__op">:-</span>
  <span class="rule__part rule__part--body" data-label="Body">pokemon(<span class="tk-var">_</span>, <span class="tk-var">Name</span>, <span class="tk-var">HP</span>), <span class="tk-var">HP</span> <span class="tk-op">&gt;</span> <span class="tk-num">150</span>.</span>
</div>

- The rule's **head** names the predicate `strong_pokemon` and its single argument `Name` (also called **head variable**).
- The rule's **body** is a conjunction, which uses a **body variable** `HP`.

- Database view: an intensional predicate defines how to compute a new table from existing ones
- Deductive view: an intensional predicate gives us rules for inferring new conclusions from what we already know

By evaluating all intensional predicates based on the EDB, we get the **intensional database** (IDB).
