# Getting started with Datamog

This page is a tutorial with **live** Datamog programs. Every code block below is
editable: click `▸ run` next to a query to evaluate it (the result appears right
under the line), and click the data chip next to an `extensional` declaration to
inspect, edit, or reset its rows.

## Facts

A directed graph is just a set of edges. We declare `edge` as an *extensional*
predicate (its rows come from data, not rules) and ask for all of them:

```datamog
extensional edge(src: string, dst: string).

?- edge(X, Y).
```

The data for `edge` is pre-loaded from a CSV file. Open the chip to see the
rows, change one, and run the query again to watch the answer update.

## Rules

Reachability is the transitive closure of `edge`. The first rule seeds the set
with everything one step from `"a"`; the second rule walks one more edge at a
time until nothing new appears:

```datamog
extensional edge(src: string, dst: string).

reachable(X) :- edge("a", X).
reachable(X) :- edge(Y, X), reachable(Y).

?- reachable(X).
```

Try adding an edge from `d` in the data chip, then re-run: the new node shows up
in the reachable set without touching the rules.

## Ground queries

A query with no variables asks a yes/no question. This one is satisfied exactly
when `"d"` is reachable from `"a"`:

```datamog
extensional edge(src: string, dst: string).

reachable(X) :- edge("a", X).
reachable(X) :- edge(Y, X), reachable(Y).

?- reachable("d").
```
