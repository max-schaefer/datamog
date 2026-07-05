---
title: "Evaluating literals"
kind: content
section: "From Rules to Answers"
tight: true
---

A **literal** is a positive atom or a **negated** atom:
- `even(N)` succeeds for values of `N` **in** the relation `even`,
- `not even(N)` for values of `N` **not in** it.

In `odd(N) :- num(N), not even(N)`, for each `N` drawn from `num`:

<div class="center">

| `N` | `even(N)`? | keep for `odd`? |
| --- | --- | --- |
| 3 | no | ✓ |
| 4 | yes | ✗ |

</div>

<div class="note">
<code>not even(N)</code> is checked against the <strong>fully computed</strong> relation <code>even</code>, so <code>even</code> must be known in full before <code>odd</code> is evaluated.
</div>
