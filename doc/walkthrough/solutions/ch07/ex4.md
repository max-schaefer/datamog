# Exercise 7.4 — Strict vs. loose

`integer ↔ float` comparison is accepted because the two types are
*numerically ordered*: every integer embeds into the reals as the
corresponding float, and the comparison after widening gives the
answer anyone would expect. There's a single canonical coercion,
no ambiguity, and every backend implements it the same way.

`integer ↔ string` has no comparable canonical coercion. Lexicographic
order ("2" < "10") differs from numeric order (2 < 10). Parsing
`"apple"` as an integer fails. Comparing a number to a string in SQL
is either a silent implicit cast (SQLite's permissive flavour) or a
runtime error (Postgres' strict flavour). Accepting such comparisons
would make the same Datalog program mean different things on
different backends.

So Datamog is strict on cross-category comparisons (numbers ↔
strings, numbers ↔ booleans) because there's no single reasonable
interpretation, and loose on `integer ↔ float` because there *is*
one. More coercions would trade off portability for syntactic
convenience, and Datamog has consistently come down on the side of
portability.
