---
title: "SQL is relational algebra"
kind: content
section: "SQL"
tight: true
---

Under the surface, SQL **is** the relational algebra from the last section:

- `SELECT` columns: **projection** `π`
- `WHERE`: **filter** `σ`
- `FROM` several tables: **product** `×`
- `UNION`, `INTERSECT`, `EXCEPT`: **union**, **intersection**, **difference**

One difference matters: SQL keeps **duplicates**.
Its tables are **bags** (multisets), not sets, so a row can appear many times unless you write `SELECT DISTINCT`.

<div class="note">
Datalog relations are <strong>sets</strong>.
The translation leans on that: against a database it uses <code>SELECT DISTINCT</code>, so duplicate rows never appear.
</div>
