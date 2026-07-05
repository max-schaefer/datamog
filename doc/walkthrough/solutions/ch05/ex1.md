# Exercise 5.1 — Hand trace on a diamond

## Input

```
parent(a, b).
parent(a, c).
parent(b, d).
parent(c, d).
```

## Naive trace

**Round 1.** Base rule fires for each `parent`:

```
(a, b), (a, c), (b, d), (c, d)
```

**Round 2.** Recursive rule fires for each pair:

- `parent(a, b) + ancestor(b, d)` → `(a, d)`
- `parent(a, c) + ancestor(c, d)` → `(a, d)`  (same tuple, set
  semantics collapses)

```
{(a, b), (a, c), (b, d), (c, d), (a, d)}
```

**Round 3.** Re-derives everything, nothing new. Fixed point
reached.

Answer: **5 distinct rows**, reached after round 2. Round 3 is
only needed to *prove* we're done.

## Seminaive trace

**Priming (iteration 0).** Base rule fires against empty `all`:

- `Δ₀ = {(a, b), (a, c), (b, d), (c, d)}`
- `ancestor = Δ₀`

**Iteration 1.** Recursive rule fires with Δ = Δ₀:

- `parent(a, b) + Δ(b, d)` → `(a, d)`
- `parent(a, c) + Δ(c, d)` → `(a, d)`  (dedup)
- `Δ₁ = {(a, d)}` — only one new row
- `ancestor = Δ₀ ∪ Δ₁` (5 rows)

**Iteration 2.** Recursive rule fires with Δ = Δ₁ = {(a, d)}:

- Need `parent(X, a)` — no such fact. `Δ₂ = ∅`.
- Stop.

`(a, d)` is derived at **iteration 1** in seminaive (vs. round 2
in naive). The deduplication in iteration 1 — two derivations of
`(a, d)` collapsing to one tuple — is where seminaive starts
earning its keep as the graph gets wider.
