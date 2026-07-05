---
title: "Recap: aggregates"
kind: content
section: "Aggregates"
tight: true
---

- An **aggregate** summarises a group of values: `count`, `sum`, `avg`, `min`, `max`.
- Other head arguments are **grouping** keys: one aggregate per key tuple; with no keys, aggregation is **global**.
- An aggregate rule still **derives** facts: one summary fact per group.
- An aggregate sees one value **per row** (a **bag**, not a set): `count`, `sum` and `avg` keep duplicate values, so `count(*)` counts rows, not _distinct_ values.
- Aggregates **cannot be recursive**, but often we can enumerate, then aggregate.
- On the **Titanic** data: survival rates, average fares and ages, the youngest and oldest survivors.

<div class="note">
Next: <strong>Part 4</strong> steps back for the theory, the tie to <strong>SQL</strong>, and working with <strong>JSON</strong>.
</div>
