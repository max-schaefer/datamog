# Exercise 3.4 — Read the SQL

## Predictions

1. **Three `SELECT`s** in `close_kin`, one per rule, joined by two
   `UNION`s.

2. The third rule reads from `"spouse"` (not `"marriage"`) because
   `spouse` is an IDB predicate — it has its own `CREATE VIEW`
   further up in the output. Each rule reads from whatever is named
   in its body; if that name resolves to a view rather than a table,
   SQL happily selects from the view and the RDBMS inlines the
   definition when it runs the query. That compositionality — you
   can refer to any already-defined predicate by name — is what
   makes Datalog scale beyond toy examples.

3. Adding `close_kin(X, X) :- parent(X, _).` adds a fourth branch
   to the `UNION`:

   ```sql
   ...
   UNION
   SELECT __b0."parent_name" AS col1, __b0."parent_name" AS col2
   FROM "parent" AS __b0
   ```

   Both `col1` and `col2` read from the same column (`parent_name`)
   of the same alias — that's how Datalog's head variable `X`,
   appearing twice in `close_kin(X, X)`, compiles.

## The moral

Each rule is translated in isolation and the translator only needs
to know the *name* and *arity* of every predicate it references —
not how that predicate is defined. Adding or removing rules never
touches the compilation of any other rule. (This independence is
the same reason the order of rules in your `.dl` file doesn't
matter: the compiler just walks the set.)
