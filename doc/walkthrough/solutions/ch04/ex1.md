# Exercise 4.1 — Bounded-step reachability

See [`ex1.dl`](ex1.dl) for the code.

## The tradeoff

**Recursive `reach` is strictly more general.** It answers "is Y
reachable from X in *any* number of steps" and lets the engine
compute the minimum automatically. When you want the full transitive
closure — or you simply don't know how many steps you'll need — this
is the right form.

**Bounded `reach_in(K, ...)` is the right form when:**

- `K` is small and fixed by the problem (e.g. "within 3 degrees of
  separation" on a social network).
- You *explicitly need the step count* as part of the answer.
- You want to keep the rule non-recursive — useful for places where
  recursion is disallowed (aggregates over recursive predicates,
  certain legacy systems).

In exchange, bounded reachability is less composable: every new
value of `K` is a new rule, and there's no `K = ∞` short-hand.
