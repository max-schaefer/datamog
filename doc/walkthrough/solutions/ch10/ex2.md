# Exercise 10.2 — Inline vs. factor

## Candidates to inline

- `is_manager(M)` can reasonably be inlined into `ic`:
  `ic(E) :- employee(E, _, _), not manages(E, _).`
  The named concept "is a manager" is used only once in the
  program.

## Candidates to keep factored

- `reports_to(R, M)` is a recursive IDB; you effectively have to
  name it to write the recursion. (Datalog doesn't have anonymous
  recursive definitions.)
- `report_count(M, C)` is read by `big_team_manager`. Inlining the
  aggregate into the filter rule isn't possible — aggregates live
  in the head, and `big_team_manager(M)` doesn't have an aggregate
  slot. So the split into two predicates is *forced* by the
  stratification rule from Chapter 9.

## The lesson

Some factorisations are stylistic (you could inline them). Others
are mandatory (recursion needs a name; aggregate-then-filter needs
two predicates). Tell the two apart and be liberal about inlining
the stylistic ones — but any concept that will be used in more
than one place deserves its own predicate, even if it's only used
twice today.
