---
title: "Recap: Datalog basics"
kind: content
section: "Datalog Basics"
tight: true
---

- **Extensional** predicates (EDB) provide input data; **intensional** ones (IDB) define computation by **rules**.
- A rule consists of a **head** declaring the predicate name and its **head variables** (arguments) and a body, which is a conjunction of (possibly negated) **atoms** that may reference the head variables as well as **body variables**.
- An atom is either a **predicate atom** applying a predicate to expressions or a **comparison** between expressions.
- A rule is **safe** when every variable is **bound**: predicate atoms and equalities **generate** values, other comparisons and negation only **filter**.
- A single intensional predicate may have more than one rule, which are understood disjunctively.
- A **query** is an anonymous intensional predicate; its values defines the program output.

<div class="note">
Next: <strong>Part 2</strong> shows how predicates can be defined in terms of themselves, with <strong>recursion</strong>.
</div>
