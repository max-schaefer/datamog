---
title: "CodeQL"
kind: content
section: "Real Systems"
tight: true
---

- GitHub's query language for **code analysis**. It turns a program into a database of facts (every function, call, and expression) that you query to find bugs and security flaws.
- The surface looks object-oriented, with `from` / `where` / `select`, but underneath it evaluates **recursive predicates to a fixed point**, with stratified negation and aggregates: the very model of these slides.

```
from Function f
where f.getName() = "main"
select f, "entry point"
```

- It powers **GitHub code scanning**: write a query once, run it across millions of repositories to find every variant of a bug.

<div class="note">
"Code as data" is the same move as our parser turning text into the <code>char</code> relation, scaled up to whole programs.
</div>
