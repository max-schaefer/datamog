---
marp: true
theme: default
paginate: true
size: 16:9
---

# Chapter 5
## How Datalog runs: naive and seminaive evaluation

Opening the engine — and meeting the two non-SQL backends

---

# Why this chapter

Chapter 4 said "apply the rules until nothing new appears". True — but a naive implementation re-does an enormous amount of work each round.

Real engines use **seminaive evaluation** instead. This chapter shows the difference by hand, on a tiny chain.

If you only want to *use* Datalog you can skim this. If you want to debug or trust it, this is the mental model.

---

# A minimal chain

```prolog
parent("a", "b").
parent("b", "c").
parent("c", "d").

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

?- ancestor(X, Y).
```

A → B → C → D. The right answer has six pairs.

---

# Naive evaluation, by hand

| Round | New / re-derived |
| --- | --- |
| 0 | (empty) |
| 1 | base: `(a,b) (b,c) (c,d)` |
| 2 | re-derive base; add `(a,c) (b,d)` |
| 3 | re-derive everything; add `(a,d)` |
| 4 | re-derive only — fixed point reached, stop |

Notice rounds 3 and 4 do mountains of work just to **re-derive known rows**. On a chain of length *n*, that's roughly *n³* total — most of it wasted.

---

# Seminaive — the key insight

After round 1, any *genuinely new* row must have been derived using at least one row added in the **previous round**.

Maintain a **delta** `Δancestor` = "new in last round". Each recursive rule fires with one body atom bound to Δ, others bound to the full relation.

---

# Seminaive on the chain

**Priming.** Run base rules naively. `Δ = {(a,b), (b,c), (c,d)}`.

**Iter 1.** `parent(X, Z), Δancestor(Z, Y)`:
- `parent(a,b) ⨝ Δ(b,c)` → `(a,c)`
- `parent(b,c) ⨝ Δ(c,d)` → `(b,d)`
- New `Δ = {(a,c), (b,d)}`.

**Iter 2.** `parent(a,b) ⨝ Δ(b,d)` → `(a,d)`. New `Δ = {(a,d)}`.

**Iter 3.** No `parent(_, a)`. `Δ = ∅`. **Stop.**

Same six rows, far less work. That's the entire trick.

---

# Try it yourself

```bash
bun run datamog --backend native    .../chain.dl
bun run datamog --backend seminaive .../chain.dl
```

Both pure-Datalog backends; same `Backend` interface as the SQL ones, just no translate-to-SQL step.

Same answers. On a tiny chain you won't notice the perf difference; on a large graph, seminaive is visibly faster.

The playground has a "step" control to advance seminaive one round at a time.

---

# Stratification

When the program has several predicates, the engine needs an **order** to compute them in:

- If `B` uses `A`, compute `A` first.
- If `A` and `B` are mutually recursive — a strongly-connected component — compute them **together** in one iteration block.
- If `B` uses `not A`, `A` must be in a **strictly lower** stratum (Chapter 8).

Tarjan's SCC + topological sort. Same order drives SQL view-creation and native iteration.

---

# Logic lens

Seminaive is a **performance** refinement; same least fixed point as naive.

Key fact: every derivation path uses at least one "new" tuple at some round, so the delta-driven iteration eventually derives every derivable fact.

This matters for Chapter 8: when negation enters, "not in `p`" isn't monotone, and the delta trick stops working directly. **Stratification** is the fix — compute `p` to completion before any rule that depends on `not p` ever fires.

---

# SQL lens

SQL's `WITH RECURSIVE` is **naive in spirit** — every iteration re-runs the step against the full accumulated result.

Modern engines internally optimise toward seminaive deltas, but the **surface semantics is naive**. That's why non-linear recursion silently breaks on SQL: the working table pins both references to the same snapshot.

The seminaive fix — one reference bound to Δ, others to the accumulated relation — is what `--backend seminaive` does explicitly. It's why that backend handles non-linear recursion correctly.

---

# Imperative lens

Seminaive is a **worklist algorithm** in disguise:

```python
ancestor = set()
delta = {(p, c) for (p, c) in parent}
while delta:
    ancestor |= delta
    delta = {(x, y)
             for (x, z) in parent
             for (z2, y) in delta
             if z == z2} - ancestor
```

Δ is the worklist. Each iteration drains it and computes the next. Compare with Chapter 4's explicit-worklist version: it's the same algorithm with a different bookkeeping convention.

---

# Recap

- **Naive evaluation** — apply rules every round until stable. Correct, but redoes work.
- **Seminaive evaluation** — thread a Δ of newly-derived tuples; each recursive rule reads from Δ in one position. Same answer, much less work.
- **Stratification** — handles inter-predicate ordering and lets non-monotone operators (negation, aggregation) coexist with recursion.
- All three are **execution strategies** for the same declarative meaning.

---

# Where to next

We've been pattern-matching facts. Time to do something else: **arithmetic**, **range generation**, and **string operations**.

Plus a fine print: these features can break the "every program terminates" guarantee. Chapter 6 explains how, and what to do about it.

[Chapter 6. Arithmetic, ranges, and strings →](06-arithmetic.md)
