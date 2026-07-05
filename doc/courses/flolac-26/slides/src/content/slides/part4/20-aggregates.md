---
title: "Aggregates"
kind: content
section: "Relational Algebra"
tight: true
---

Aggregates group and summarise.
From Part 3, the average fare per class:

```prolog
fare_by_class(Class, avg(Fare)) :- passenger(_, _, Class, _, Fare).
```

First project `passenger` onto the columns that matter, `Class` (`#3`) and `Fare` (`#5`).
Then `γ` averages `Fare`, grouping by everything else, here `Class`:

<div class="ra">fare_by_class := γ<sub>#2 : avg</sub>( π<sub>#3, #5</sub>( passenger ) )</div>

<div class="note">
The grouping column comes first, then the aggregate, giving rows <code>(Class, avg)</code>, matching the head <code>fare_by_class(Class, avg(Fare))</code>.
</div>
