---
title: "Logic Programming"
kind: content
section: "Introduction"
---

- A kind of **declarative** programming: say *what* we want to compute, not *how*<span class="aside">This is the same basic idea as in functional programming.</span>
- Underneath, a program is a **(first-order) logic formula**; running it finds the variable assignments that make it true.
- We will use two complementary, practical views throughout:
    1. **Database view**: predicates are **tables** of rows; we query existing tables and build new ones.
    2. **Deductive view**: a program is a set of **rules**; given an initial set of facts, find the facts that follow.
