---
title: "Variant: left-recursive"
kind: content
section: "Recursion"
---

The recursive step can put the recursive call **first**, then take a line:

```datamog
extensional line(from: string, to: string).

reach(X, Y) :- line(X, Y).               # base case
reach(X, Y) :- reach(X, Z), line(Z, Y).  # left-recursive step

?- reach("Taipei Main Station", Y).
```

<div class="note">
It builds up in exactly the <strong>same rounds</strong> as the original, to the same eight pairs.

This does not lead to non-termination: it uses the (partial) <code>reach</code> from the <em>previous</em> round.
</div>
