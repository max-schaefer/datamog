---
title: "Aggregates can't recurse"
kind: content
section: "Aggregates"
tight: true
---

An aggregate summarises a **finished** relation.
If an aggregate depends on **itself**, its meaning breaks down:

```datamog
in_club("alice").
in_club("bob")    :- members(N), N < 2.   # bob joins a small club
members(count(*)) :- in_club(_).

?- members(N).
```

If `bob` is out, `members` is `1`, and `1 < 2` lets him **in**.
But then `members` is `2`, and `2 < 2` keeps him **out**.

No value of `members` agrees with itself: every count leads to a different count.

<div class="note">
Like negation in a cycle, there is no fixed point to converge to, so Datamog rejects it: <em>"Aggregate predicate 'members' cannot be recursive."</em>
</div>
