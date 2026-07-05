---
title: "Evaluating expressions"
kind: content
section: "From Rules to Answers"
tight: true
---

An **expression** is built from variables, constants and operators (`+`, `-`, `*`, `/`, `%`, …).

Once its variables have values it **denotes a value**; by itself it is neither true nor false.

In `even(N) :- num(N), N % 2 = 0`, the expression `N % 2`:

<div class="center">

| `N` | `N % 2` |
| --- | --- |
| 4 | 0 |
| 5 | 1 |
| 6 | 0 |

</div>

<div class="note">
Only inside a comparison, <code>N % 2 = 0</code>, does an expression take part in a true/false test.
</div>
