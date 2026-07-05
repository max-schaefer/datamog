---
title: "Why relational algebra?"
kind: content
section: "Relational Algebra"
tight: true
---

In the introduction, **SQL** sat just inside Datalog on the expressiveness spectrum.
SQL's engine is **relational algebra**: a handful of operations on whole **tables**.

A database has no variables and no rules, only tables and those operators.
Translating Datalog into them pins down **exactly** what a program computes, in a language a database already runs.
It is also how Datamog's SQL backends evaluate your rules.

<div class="note">
The punchline, built up over the next slides: <strong>non-recursive Datalog is relational algebra</strong>, and recursion adds one thing more, a <strong>least fixed point</strong>.
</div>
