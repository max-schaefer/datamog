---
title: "Building both at once"
kind: content
section: "Naive Evaluation"
tight: true
---

Start both relations empty and evaluate all three rules each round, over `num = {0, 1, 2, 3}`:

| round | `even` | `odd` |
|---|---|---|
| 0 | `{}` | `{}` |
| 1 | `{0}` | `{}` |
| 2 | `{0}` | `{1}` |
| 3 | `{0, 2}` | `{1}` |
| 4 | `{0, 2}` | `{1, 3}` |
| 5 | (no change) | (no change) |

<div class="note">
Each round feeds the next, the relations growing in turn, until a round adds nothing new.
</div>
