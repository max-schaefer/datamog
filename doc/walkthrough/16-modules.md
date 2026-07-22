# Chapter 16 — Modules

Every program so far has been one file. That is fine for a self-contained
example, but real work wants reuse: a transitive-closure you can point at a road
network today and a flight network tomorrow, without copying the two recursive
rules and renaming everything by hand.

Datamog gets there by re-reading two things you already have. A file's `input
predicate`s are its parameters; its `output predicate`s and its unnamed `?-`
default are its results. So a **file is a function from input relations to output
relations**. To reuse one, you *instantiate* it: wire its inputs to relations you
have and give its outputs local names. That is the whole module system — no
separate `import` construct, just a way to bind an input to a source.

## A file is a function

Here is generic reachability, parameterised by an edge relation. Nothing about
it mentions roads or flights:

```prolog
# reach.dl
input predicate edge(src: integer, dst: integer).

output predicate reach(X, Y) :- edge(X, Y).
output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
```

Read as a function, `reach.dl` takes one relation, `edge`, and returns one,
`reach`. `edge` is a *parameter*: on its own the file has no data for it, and
running `reach.dl` directly would load `edge.csv` by convention (Chapter 1). An
importer supplies it instead.

The tool for that is the **`:=` binding** on an input predicate. It reads as a
pun on `:-`: where `:-` means "defined by rules", `:=` means "bound to a
source". A binding is one of two things, and a single rule tells them apart:
**`from` present means another module; a bare string means a data file.**

## Binding an input to a data file

Start with the simpler half. You already know that a free input auto-loads from
`<name>.csv` in the program's directory. A `:=` data binding names the file
explicitly instead:

```prolog
input predicate airport(code: string, name: string) := "data/airports.tsv" as csv.
```

The source is resolved relative to the importing file, and may equally be a URL
or a `gh:` shorthand (the same set `--input` accepts). The loader is normally
chosen by the extension; `as <format>` (`csv`, `jsonl`, `json`, `mermaid`)
forces it when the extension lies — here a `.tsv` file that is really CSV. That
is all there is to data bindings; the interesting half is modules.

## Importing a module

A module binding instantiates another file and wires this input to one of its
outputs:

```prolog
# main.dl
input predicate road(src: integer, dst: integer).
input predicate road_reach(a: integer, b: integer) := reach from "reach.dl"(edge = road).

?- road_reach(1, X).
```

Read the right-hand side left to right:

- **`reach`** selects a named output of the module — its `output predicate
  reach`.
- **`from "reach.dl"`** is the module, resolved relative to `main.dl`.
- **`(edge = road)`** supplies the module's inputs by name: the callee's `edge`
  is wired to `main.dl`'s `road`. An actual is always just a predicate name from
  the importing file's scope (here a leaf input; it could be any predicate).

The local name `road_reach` *is* the instance's `reach` output, so the rest of
`main.dl` uses it like any predicate. With `road.csv` holding the edges
`1→2→3→4`:

```
?- road_reach(1, X).
X = 2
X = 3
X = 4
```

Unlike every earlier chapter, these are multi-file programs: run them with the
CLI (`datamog doc/walkthrough/code/ch16/main.dl`), which resolves `from
"reach.dl"` from disk relative to `main.dl`. The browser playground has no
filesystem, so it runs single-file programs only.

> **Imperative lens.** `reach.dl` is a generic function over a relation, and the
> binding is a call: `road_reach = reach(edge = road)`. It is the parametric
> polymorphism you would reach a generic or a template for in another language —
> write the algorithm once, apply it to many arguments.

## Instantiate it more than once

The payoff is reuse. Bind the same module a second time, to a different relation:

```prolog
# main.dl (continued)
input predicate flight(src: integer, dst: integer).
input predicate flight_reach(a: integer, b: integer) := reach from "reach.dl"(edge = flight).
```

Now `road_reach` and `flight_reach` are two independent transitive closures, both
from the one `reach.dl`. `datamog --all main.dl` runs every output:

```
-- road_reach          -- flight_reach
 a │ b                  a  │ b
 1 │ 2                  1  │ 10
 2 │ 3                  10 │ 20
 3 │ 4                  1  │ 20
 1 │ 3
 2 │ 4
 1 │ 4
```

Notice the result columns are `a` and `b` — the names *you* declared on
`road_reach`, not the `X`/`Y` the module happened to use internally. The
declared columns are the instance's public face.

> **Logic lens.** A module is a parameterised theory, and instantiation is
> substitution: `reach.dl` states "for all binary relations `edge`, `reach` is
> its transitive closure", and each binding picks a particular `edge`. This is
> exactly an ML *functor* (a module parameterised by a module) or a Soufflé
> *component*, with relations as the parameters.

## Under the hood: elaboration

Before anything runs, a program with bindings is **elaborated** into one flat
program, which then goes through the ordinary pipeline (Chapter 5) unchanged — so
the backends need no module machinery at all. For each instantiation Datamog
takes a fresh copy of the module, substitutes the wired inputs, renames the
selected output to the importing name, and *freshens* every other name with a
per-instance prefix so two copies never collide. Everything merges into one
program with one least fixed point.

> **SQL lens.** Elaboration is monomorphisation: each instance becomes its own
> set of views. `datamog --dry-run main.dl` shows the two closures compiled to
> two independent recursive views, each over its own edge table:
>
> ```sql
> CREATE VIEW IF NOT EXISTS "road_reach" AS
>   WITH RECURSIVE "road_reach"(col1, col2) AS (
>     SELECT __b0."src", __b0."dst" FROM "road" AS __b0
>     UNION
>     SELECT __b0."col1", __b1."dst" FROM "road_reach" __b0, "road" __b1
>       WHERE __b0."col2" = __b1."src"
>   ) SELECT * FROM "road_reach";
>
> CREATE VIEW IF NOT EXISTS "flight_reach" AS ...  -- the same, over "flight"
> ```

Because each instance is a fresh copy, instantiating twice really does duplicate
the module's rules. That is correct but not minimal — two identical
instantiations generate the SQL twice. Sharing identical instances is a possible
future optimisation; today, every binding is its own copy.

## Composing modules

A module can itself import a module: `reach.dl` could wire its `edge` input to a
`filter.dl` that keeps only some edges. Bindings compose to any depth, resolved
relative to each file in turn.

There is one rule. The **instantiation graph must be acyclic**: two modules whose
inputs each default to an instance of the other are rejected, because expansion
would copy them forever. Keep this separate from recursion *within* a module,
which is completely fine — that is an ordinary least fixed point over the merged
program (`reach` is recursive, after all). The practical consequence: mutually
recursive predicates must live in the same file. Recursion inside a module, yes;
a recursive *wiring* cycle between modules, no.

## The default output

A module need not name its outputs. A library with a single `?-` query exposes
that query as its **default output**; select it by omitting the export name:

```prolog
input predicate ordered(lo: integer, hi: integer) := from "asc.dl"(p = road).
```

Everything else is the same: `from "asc.dl"` with no name ahead of it takes the
`?-` result, wired here through `p = road`. A named export is the norm for a
reusable library; the default is the convenient one-result case.

## Boundary types

The declared columns on the importing input are a **contract**, checked against
what the module actually produces. Declare `road_reach(a: string, b: string)` for
an integer closure, or wire a string relation to the integer `edge`, and you get
a static error naming the offending column — before anything runs. The same
column-type compatibility as any ordinary join applies (Chapter 7); the types you
write at the boundary are the ones enforced.

## A few rules of the road

- **`from` distinguishes the two bindings.** `from` present is a module; a bare
  string is a data file. `from`, `as` (and `input`/`output`/`predicate`) are
  contextual keywords — you can still name a column `from` or `to`.
- **One output per import.** An instance exposes only the output you select; the
  module's other outputs and its `?-` default stay internal.
- **Every import is a fresh copy** (duplicate-per-use), freshened so instances
  never collide. Freshened names contain `$`, which no source identifier can, so
  they never clash with yours.
- **The instantiation graph must be acyclic.** Mutually recursive predicates
  share a file.
- **Free inputs are shared, not freshened.** A module's own unwired input keeps
  its bare name, so two instances read the same bundled data (and it can clash
  by name with an importer predicate spelled the same). Wire an input as an
  actual when you want a per-instance relation.

## Exercises

### Exercise 16.1 — Point it somewhere new ★

Add a third relation to `main.dl` — say a `friend` graph in `friend.csv` — and a
third binding `friend_reach := reach from "reach.dl"(edge = friend)`. Confirm
`--all` now reports three closures from the one `reach.dl`.

### Exercise 16.2 — A data-file binding ★

Rename `road.csv` to `roads.tsv` (still comma-separated) and bind `road` to it
explicitly with `:= "roads.tsv" as csv`. Why is the `as csv` needed here, and
what happens without it?

### Exercise 16.3 — Filter, then reach ★★★

Write `filter.dl` with an input `raw(a: integer, b: integer)` and an output
`kept` that drops self-loops (`a != b`). In `main.dl`, bind a `clean` input to an
instance of `filter.dl`, then wire `reach.dl`'s `edge` to `clean` instead of
straight to `road`, so the closure runs over the filtered edges. (This chains two
modules — `filter`'s output into `reach`'s input; the instantiation graph is a
chain, not a cycle, so it is fine.)

### Exercise 16.4 — Break the contract ★★

Declare `road_reach(a: string, b: string)` and run it. Read the error. Then wire
`edge` to a relation whose columns are strings and run again. Which boundary does
each error name, and at what point in the pipeline is it caught?

---

Next: **[Appendix A — The three lenses cheat sheet](A-lenses.md)**.
