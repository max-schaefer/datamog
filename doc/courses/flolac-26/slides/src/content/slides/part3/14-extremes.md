---
title: "Youngest and oldest survivors"
kind: content
section: "Statistics"
tight: true
---

```prolog
survivor(Id, Class)           :- passenger(Id, 1, Class, _, _).

youngest_survivor(min(Years)) :- survivor(Id, _), age(Id, Years).
oldest_survivor(max(Years))   :- survivor(Id, _), age(Id, Years).
```

Overall: youngest **0.42** (five months), oldest **80**.

By class:

<div class="center">

| class | youngest | oldest |
| --- | --- | --- |
| 1 | 0.92 | 80 |
| 2 | 0.67 | 62 |
| 3 | 0.42 | 63 |

</div>
