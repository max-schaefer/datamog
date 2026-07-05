---
title: "The eligible heirs"
kind: content
section: "Crown the Rightful Heir"
tight: true
---

Only living descendants are eligible, and criminals are not.

```datamog
extensional parent(parent: string, child: string).
extensional deceased(name: string).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
descendant(X, Y) :- ancestor(Y, X).
criminal("kate").   # the crown thief from Part 1

living_descendant(X) :- descendant(X, "basil"), not deceased(X).
eligible_heir(X)     :- living_descendant(X), not criminal(X).

?- eligible_heir(X). # "diana", "alice", "eve", "frank", "henry", "carol"
```

<div class="note">
The eligible heirs are Diana, Alice, Eve, Frank, Henry and Carol.

Diana, Basil's only living child, takes the crown, but for now we pick her by hand. In <strong>Part 3</strong> an aggregate crowns the closest heir for us.
</div>
