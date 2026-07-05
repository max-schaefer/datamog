# Exercise 3.5 — Disjunction as multiple predicates

See [`ex5-refactor/ex5-refactor.dl`](ex5-refactor/ex5-refactor.dl)
for a worked refactoring.

## When the multi-rule form is better

- **When the rules really are "the same concept, different
  sources".** `can_see(X, Y) :- same_room(X, Y).` and
  `can_see(X, Y) :- connected_window(X, Y).` are both answering
  the same question ("can X see Y?"), so they belong in the same
  predicate.
- **When there is no meaningful intermediate name.** Inventing
  `visible_through_window` just to turn one rule into a one-line
  definition adds noise.
- **When the rules won't be queried individually.** If no other
  part of the program needs "just the window edges", keeping them
  inside `can_see` is simpler.

## When the refactored form is better

- **When an intermediate concept is reusable.** If `roommate` is
  referenced in three other places, pull it out so those callers
  can name it directly.
- **When the rules have different costs or come from different
  sources.** If `connected_window` is expensive to compute and
  often cached separately, separating it gives you a named handle.
- **When the intermediate predicate has a crisp name.**
  `roommate` is an obvious concept; "can_see case 1" is not.

## The tradeoff in one sentence

Keep disjunction at the predicate level when the branches are
*cases of one concept*; split into named predicates when the
branches are *distinct concepts that happen to be unioned*.
