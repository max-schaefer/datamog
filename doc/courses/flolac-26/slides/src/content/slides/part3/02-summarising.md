---
title: "Summarising data"
kind: content
section: "Aggregates"
---

So far a query lists **individual** rows.

An **aggregate**:

- evaluates an expression once for each row of a table;
- collects the resulting values;
- and combines them into a single value using an operation such as `sum`, `avg`, `min` or `max`.

A further aggregate, `count(*)`, counts the number of rows.