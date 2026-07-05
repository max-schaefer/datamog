---
title: "Reachability without recursion"
kind: content
section: "Recursion"
tight: true
---

Which stations can you reach from `Taipei Main Station`?

We could write **one rule per number of stops**:

```prolog
reach(X, Y) :- line(X, Y).                            # 1 stop
reach(X, Y) :- line(X, Z), line(Z, Y).                # 2 stops
reach(X, Y) :- line(X, Z), line(Z, W), line(W, Y).    # 3 stops
```

Three rules are enough for our metro, but more stops need more rules!

<div class="note">
Can we define <code>reach</code> so it works for any number of stops?
</div>
