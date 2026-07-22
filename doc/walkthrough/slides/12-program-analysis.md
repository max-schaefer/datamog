---
marp: true
theme: default
paginate: true
size: 16:9
---

# Chapter 12
## Case study — program analysis

Reaching definitions in six lines of Datalog

---

# Datalog's biggest industrial use

Static program analysis. Frameworks like:

- **Soufflé** (souffle-lang.github.io)
- **LogicBlox**
- **Doop** — pointer analyses for Java

…express analyses as Datalog programs and compile them to native code.

The result: thousands of lines of hand-written C++ analysis become a few hundred lines of declarative rules.

---

# Reaching definitions — the analysis

A **reaching definition** at program point *P* is an assignment `x = e` that might have produced the current value of `x` on some path to *P*.

Classic data-flow equations:

- A definition **generated** in a block reaches the exit of that block (unless killed).
- A definition reaches the entry of a block if it reaches the exit of *some predecessor* and is not killed there.

Forward "may" analysis. Computed bottom-up over the control-flow graph.

---

# The Datalog version

```prolog
# Control-flow graph
cfg("start", "b1").  cfg("b1", "b2").  cfg("b1", "b3").
cfg("b2", "b4").     cfg("b3", "b4").
cfg("b4", "b1").     cfg("b4", "end").

# Definitions generated / killed at each block
gen("b2", "d1").     gen("b4", "d2").
kill("b4", "d1").    kill("b2", "d2").

# Reaching-definitions analysis
reaches(D, U) :- gen(U, D).
reaches(D, V) :- cfg(U, V), reaches(D, U), not kill(U, D).

?- reaches(Def, Block).
```

**Six lines of actual logic.** No worklist, no termination check, no iteration counter.

---

# What Datalog absorbs

Compared to the imperative version (worklist BFS, per-block `reaches_in` / `reaches_out` sets, iteration until stable), Datalog elides:

| Imperative concern | Datalog handles via |
| --- | --- |
| Worklist + termination check | Seminaive evaluation (Ch 5) |
| `gen` vs. propagation case analysis | Multiple rules, unioned naturally |
| "Not killed along the way" | Stratified negation (Ch 8) |
| Fixed-point orchestration | Linear recursive step |

The full machinery reduces to **what you'd naturally write in pseudo-code**. No translation step.

---

# Why this generalises

Reaching definitions is one of a whole family of data-flow analyses:

- **Live variables** — backwards version.
- **Available expressions** — must-reach instead of may-reach.
- **Very busy expressions**.
- **Copy propagation**.
- **Constant propagation** — trickier (needs values, lattice issues).

Each follows the same "rules + recursion + optional negation" skeleton. Soufflé scales this to **whole-program pointer analyses** (Doop's main engine: ~1000 lines of Datalog).

---

# The deep reason it works

Declarative recursion over relations is **exactly what data-flow analysis is**, mathematically.

Imperative implementations have historically buried that identity under bookkeeping. Datalog **surfaces it**.

That's why the same skeleton scales from textbook reaching definitions to industrial-strength security taint analyses.

---

# Extending the analysis — taint propagation

```prolog
tainted_at_source("d2").

tainted_def(D) :- tainted_at_source(D).
tainted_reaches(Block, D) :-
    reaches(D, Block), tainted_def(D).
```

Two new rules. **No change to the core analysis.** No worklist re-plumbing.

That's the payoff of composability: every IDB is a named, queryable relation.

---

# Extending the analysis — def-use pairs

```prolog
input predicate use(block: string, defname: string).

def_use(Block, D) :- use(Block, D), reaches(D, Block).
```

One more rule on top of the existing pipeline. New question, no re-architecture.

---

# Recap

- Many classical program analyses — reaching definitions, live variables, constant propagation, pointer analysis — reduce to **fixed-point over a few recursive rules**.
- Datalog's features (recursion, negation, stratification) **match the mathematical structure** of these analyses directly.
- Industrial frameworks (Soufflé, LogicBlox, Doop) compile Datalog to efficient native code, making the declarative form the **source** of production systems.

---

# Where to next

Graphs are the other family of problems Datalog handles with unusual grace: closures, shortest paths, bills of materials.

[Chapter 13. Case study — graph algorithms →](13-graphs.md)
