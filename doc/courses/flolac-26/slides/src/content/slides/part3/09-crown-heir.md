---
title: "Crowning the rightful heir"
kind: content
section: "Aggregates"
tight: true
---

Part 2 left us with **six** eligible heirs and a hand-wave: Diana wins because she is Basil's **closest** living descendant. An aggregate says that precisely.

First count the **generations** from Basil, one step at a time (recursion, like `ancestor`, but carrying the distance). Then take the **smallest** distance among the eligible heirs and crown whoever sits there:

```prolog
generation("basil", 0).                                             # Basil is generation 0
generation(C, D + 1) :- parent(P, C), generation(P, D).             # a child is one deeper

heir_distance(X, D)     :- eligible_heir(X), generation(X, D).      # eligible_heir: from Part 2
throne_distance(min(D)) :- heir_distance(_, D).                     # the closest distance
heir(X)                 :- heir_distance(X, D), throne_distance(D). # who sits at it

?- heir(X).   # "diana": the single rightful heir
```

<div class="note">
The <strong>min-then-join</strong> idiom: an aggregate yields the extreme <em>value</em>, so we join back to recover the <em>row</em> that attains it. Equally close heirs would all be crowned, which is right until a further rule (say, birth order) breaks the tie.
</div>
