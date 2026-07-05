---
title: "Negation makes emptiness undecidable"
kind: content
section: "Metatheory"
tight: true
---

Negation turns the **containment** question into an **emptiness** one.
Collect everything in `a` but not in `b`:

```prolog
diff(X) :- a(X), not b(X).
```

Then `a ⊆ b` holds **exactly when** `diff` is empty.

<div class="note">
Deciding emptiness of <code>diff</code> would decide containment, which we just saw is <strong>undecidable</strong>. So once negation enters the language, emptiness is undecidable too.
</div>
