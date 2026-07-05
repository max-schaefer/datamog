---
title: "Sufficient, but not necessary"
kind: content
section: "Least Fixed Points"
tight: true
---

Stratification **guarantees** a least fixed point, yet some unstratified programs have one anyway.

Take a **subtraction game**: a pile of stones, players alternate removing **1, 2, or 3**, and taking the last stone wins.

```datamog
take(1).  take(2).  take(3).
move(P, Q) :- P in [0 .. 20], take(K), Q = P - K, Q >= 0.
win(P)     :- move(P, Q), not win(Q).

?- win(P).
```

A position **wins** if some move reaches a losing position, so `win` depends on `not win`: Datamog rejects!

But every move **shrinks** the pile, so in fact the program has a least fixed point.
<span class="aside">The losing positions turn out to be the multiples of 4.</span>

<div class="note">
Stratification is <strong>sufficient</strong> but not <strong>necessary</strong>.
If it cannot be sure, Datamog rejects the program.
</div>
