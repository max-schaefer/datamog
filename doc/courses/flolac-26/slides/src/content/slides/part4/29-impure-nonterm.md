---
title: "New values, no guarantee"
kind: content
section: "Impure Datalog"
---

Arithmetic and string operations build values **not** in the input, so the earlier reasoning that the set of facts is finite no longer holds:

```prolog
nat(0).
nat(X + 1) :- nat(X).   # 0, 1, 2, 3, ... forever
```

Each round produces a larger number, so the iteration **never** reaches a fixed point.
Datamog does not stop you: this program runs until you stop it.

<div class="note">
With unrestricted arithmetic, Datalog becomes <strong>Turing-complete</strong>, so termination is undecidable.
Avoiding non-termination becomes your responsibility.
</div>
