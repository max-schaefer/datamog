---
title: "Negation and don't-care"
kind: content
section: "From Rules to Answers"
tight: true
---

Outside `not`, the don't-care `_` behaves like a **fresh, use-once variable**: `divisor(_, 6)` is just `divisor(X, 6)` for a throwaway `X`.

Under `not`, that shortcut breaks: `not p(_)` and `not p(X)` are **not** the same.

- `not p(X)` reads **∃X. ¬p(X)** — "some `X` is not in `p`". The **∃** sits *outside* the negation, so `X` must be bound elsewhere; on its own `not p(X)` is unsafe.
- `not p(_)` reads **¬∃X. p(X)** — "`p` holds of nothing". The **∃** sits *inside* the negation.

So `not p(_)` is **safe on its own**: `_` needs no binding. It succeeds exactly when `p` is empty.

<div class="note">
The difference is quantifier scope: under <code>not</code>, the don't-care's <strong>∃</strong> stays <em>inside</em> the negation, turning <code>not p(_)</code> into the test "is <code>p</code> empty?".
</div>
