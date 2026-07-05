---
title: "Who survived?"
kind: content
section: "Statistics"
tight: true
---

```prolog
extensional passenger(id: integer, survived: integer, class: integer, sex: string, fare: float).
```

Since `survived` is 0 or 1, its average is the survival rate:

<div class="columns">

<div>

```prolog
survival_by_sex(Sex, avg(Survived), count(*)) :-
    passenger(_, Survived, _, Sex, _).
```

| Sex | rate | N |
| --- | --- | --- |
| female | 0.74 | 314 |
| male | 0.19 | 577 |

</div>

<div>

```prolog
survival_by_class(Class, avg(Survived), count(*)) :-
    passenger(_, Survived, Class, _, _).
```

| class | rate | N |
| --- | --- | --- |
| 1 | 0.63 | 216 |
| 2 | 0.47 | 184 |
| 3 | 0.24 | 491 |

</div>

</div>
