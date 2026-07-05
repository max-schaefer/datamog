---
title: "Recursion, the SQL way"
kind: content
section: "SQL"
tight: true
---

Recursion reached SQL late, as the **recursive common table expression**.
`WITH RECURSIVE` computes a **fixed point**, exactly the metro reachability from Part 2:

```sql
WITH RECURSIVE reach(src, dst) AS (
  SELECT src, dst FROM line
  UNION
  SELECT line.src, reach.dst
  FROM line JOIN reach ON line.dst = reach.src
)
SELECT * FROM reach;
```

<div class="note">
But standard SQL allows only <strong>linear</strong> recursion: the recursive case may name <code>reach</code> just <strong>once</strong>.
The doubly-recursive transitive closure and the parser cannot be expressed in plain SQL.
</div>
