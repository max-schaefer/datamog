---
title: "The CNF as data"
kind: content
section: "Propositional Logic"
---

Store the formula as facts.
A literal is a variable with a **polarity** (`1` plain, `0` negated); it is true under an assignment exactly when the variable's value equals its polarity:

```prolog
input predicate literal(clause: integer, var: integer, polarity: integer).
```

<div class="center">

| clause | literal facts |
| --- | --- |
| ① (p ∨ ¬q ∨ r)  | `literal(1,0,1)` `literal(1,1,0)` `literal(1,2,1)` |
| ② (p ∨ ¬q ∨ ¬r) | `literal(2,0,1)` `literal(2,1,0)` `literal(2,2,0)` |
| ③ (p ∨ q ∨ r)   | `literal(3,0,1)` `literal(3,1,1)` `literal(3,2,1)` |

</div>
