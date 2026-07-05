---
title: "Translating Datalog to SQL"
kind: content
section: "SQL"
tight: true
---

So the relational-algebra translation **is** a SQL translation.
A non-recursive predicate becomes a `SELECT` (a `VIEW`); a linearly-recursive one becomes a `WITH RECURSIVE`.
Only **non-linear** recursion, like the formula evaluator and parser from Part 2, has no SQL form and stays on the in-memory backends.

Datamog ships exactly these: backends for **Postgres**, **SQLite**, and an in-browser **sql.js**, alongside the native interpreters.

<div class="note">
One language, many engines: the same program runs on a real database when it can, and on the in-memory evaluators when it cannot.
</div>
