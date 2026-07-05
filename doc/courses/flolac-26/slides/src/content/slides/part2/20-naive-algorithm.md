---
title: "Naive evaluation"
kind: content
section: "Naive Evaluation"
tight: true
---

The same recipe runs **every** recursive program:

```
start: every rule-defined predicate is empty
repeat:
    evaluate every rule body against the current
    relations, adding any new tuples we find
until a round adds nothing new
```

This is **naive evaluation**: each round re-evaluates all the rules using the predicates' current definitions, and it always reaches the same answer.

<div class="note">
Two readings of a round: the predicate's <strong>table</strong> (its <em>relation</em>) gains rows, or equivalently we <strong>derive</strong> new facts.

A round only <strong>adds</strong> tuples, and over a finite set there are only finitely many to add, so the rounds must end.

The next section explains what value the iteration finally reaches.
</div>
