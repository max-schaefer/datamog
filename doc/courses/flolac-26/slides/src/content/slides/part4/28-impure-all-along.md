---
title: "Impure from the start"
kind: content
section: "Impure Datalog"
---

Pure Datalog is the safe core, but most of our programs already used features beyond it:

- **Arithmetic** did the counting: `even`/`odd` stepped with `N - 1`, and the parser advanced with `F + 1`.
- **Aggregates** folded whole groups: the Titanic `count`, `avg`, `min` and `max`.
- The JSON `value` type, coming up next, is one more step out.

This is what lets Datalog **compute**, not merely query.
The catch is on the next slide.

<div class="note">
"Impure" is not a warning; it describes most real programs.
The point is knowing <strong>which</strong> guarantee you trade away, and when.
</div>
