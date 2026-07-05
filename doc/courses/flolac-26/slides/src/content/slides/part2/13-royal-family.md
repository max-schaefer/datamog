---
title: "The king is dead"
kind: content
section: "Crown the Rightful Heir"
tight: true
---

King Basil has died without saying who should rule next.

To find the rightful heir, we look at the royal family records, given as `parent` and `deceased` facts:

```prolog
parent("basil", "edmund").  parent("basil", "diana").    parent("basil", "george").
parent("edmund", "alice").  parent("edmund", "bob").     parent("diana", "eve").
parent("diana", "frank").   parent("george", "henry").   parent("george", "kate").
parent("bob", "carol").

deceased("basil"). deceased("edmund"). deceased("bob"). deceased("george").
```

<div class="note">
The crown passes to a <strong>living descendant</strong> of Basil, across <strong>any</strong> number of generations: here recursion solves the problem!
</div>
