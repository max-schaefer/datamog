---
title: "The heirs, stratified"
kind: content
section: "Least Fixed Points"
tight: true
---

<div class="columns" style="align-items: center;">

<div>

```prolog
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
descendant(X, Y) :- ancestor(Y, X).
criminal("kate").
living_descendant(X) :-
    descendant(X, "basil"), not deceased(X).
eligible_heir(X) :-
    living_descendant(X), not criminal(X).
```

</div>

<div>

<img class="graph" style="max-height: calc(var(--u) * 48);" src="/images/heirs-stratification.svg" alt="Dependency graph of the eligible-heirs program, drawn as two stacked level boxes. The upper box, level 1, holds eligible_heir and living_descendant. The lower box, level 0, holds descendant, ancestor, parent, deceased and criminal. Solid teal arrows are positive dependencies: eligible_heir to living_descendant, living_descendant to descendant, descendant to ancestor, ancestor to parent, and a self-loop on ancestor for its recursion. Two dashed arrows labelled with a minus sign point down from level 1 to level 0 for the negative dependencies: eligible_heir to criminal, and living_descendant to deceased." />

</div>

</div>

<div class="note">
Both negations point <strong>down</strong> a level, so conditions 1 and 2 hold: Datamog evaluates level 0, then level 1.

Positive recursion (<code>ancestor</code>) stays <strong>within</strong> a level.
</div>
