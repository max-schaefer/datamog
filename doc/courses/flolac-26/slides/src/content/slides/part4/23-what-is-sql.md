---
title: "What is SQL?"
kind: content
section: "SQL"
tight: true
---

**SQL** is the query language of **relational databases**: you describe the rows you want from a set of tables, and the engine works out how to fetch them.

```sql
SELECT name FROM person WHERE age >= 18;
```

IEEE Spectrum calls SQL [the second programming language everyone needs to know](https://spectrum.ieee.org/the-rise-of-sql): whatever else you build with, you will meet a database.

<div class="note">
We meet it here for a reason: the <strong>relational algebra</strong> of the last section is SQL's core.
So Datalog and SQL are more similar than they first appear.
</div>
