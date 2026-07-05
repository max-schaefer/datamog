---
title: "Exercise: make it reflexive"
kind: content
section: "Recursion"
tight: true
---

Make `reach` **reflexive**: every station should reach itself, in zero steps.

First list all the stations (the places that appear on some line), then let each station reach itself:

```datamog
extensional line(from: string, to: string).

station(X) :- line(X, _).
station(X) :- line(_, X).

reach(X, X) :- station(X).
# rest is as before:
reach(X, Y) :- line(X, Y).                 # not strictly needed
reach(X, Y) :- line(X, Z), reach(Z, Y).

?- reach("Taipei Main Station", Y).        # new result: Y = "Taipei Main Station"
```

