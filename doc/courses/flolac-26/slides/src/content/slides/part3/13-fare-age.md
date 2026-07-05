---
title: "Fares and ages"
kind: content
section: "Statistics"
tight: true
---

```prolog
extensional passenger(id: integer, survived: integer, class: integer, sex: string, fare: float).
```

<br>

<div class="columns">

<div>

```prolog
fare_by_class(Class, avg(Fare)) :-
    passenger(_, _, Class, _, Fare).
```

| class | avg fare |
| --- | --- |
| 1 | 84.15 |
| 2 | 20.66 |
| 3 | 13.68 |

</div>

<div>

```prolog
age_by_survival(Survived, avg(Years), count(*)) :-
    passenger(Id, Survived, _, _, _), age(Id, Years).
```

| survived | avg age | count |
| --- | --- | --- |
| 0 | 30.6 | 424 |
| 1 | 28.3 | 290 |

<br>

<div class="note">
424 + 290 = 714 < 891: not all ages are known.
</div>

</div>

</div>
