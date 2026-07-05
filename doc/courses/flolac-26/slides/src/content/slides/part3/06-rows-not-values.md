---
title: "Rows, not values"
kind: content
section: "Aggregates"
tight: true
---

An aggregate runs over the **rows** the body produces, one value per row. Relations are **sets**, so there are no duplicate *rows*, but two different rows can carry the **same value**, and the aggregate keeps both:

```prolog
p(1, 1).  p(2, 1).  p(3, 2).

q(avg(Y)) :- p(_, Y).   # avg of (1, 1, 2) = 1.33, not avg of {1, 2} = 1.5
```

The same holds for `count(*)`: it counts **rows**, not distinct values (`*` is "every row", like SQL's `COUNT(*)`).

<div class="note">
Set semantics is about <strong>rows</strong>, not about the values handed to an aggregate. That <strong>bag</strong> of values, duplicates and all, is exactly what makes <code>sum</code> and <code>avg</code> useful.
</div>
