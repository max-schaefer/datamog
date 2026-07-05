---
title: "How hard is it?"
kind: content
section: "Metatheory"
---

Termination is not enough; we want it **cheap**. Two ways to measure:

- **Data complexity** (program fixed, data grows): **PTIME-complete**, polynomial in the size of the database.
- **Combined complexity** (program and data both grow): **EXPTIME-complete**, since a program with `k` variables per rule ranges over up to `nᵏ` tuples.

<div class="note">
Datalog is well balanced: it adds <strong>recursion</strong> to database queries, yet stays <strong>tractable</strong> in the data.
With stratified negation and an order on the data, it captures <strong>exactly</strong> the polynomial-time queries.
</div>
