# Datamog Tutorials

Learn Datamog by solving puzzles. These tutorials are adapted from the
[CodeQL QL tutorials](https://codeql.github.com/docs/writing-codeql-queries/ql-tutorials/)
and from examples in the
[Datalog Educational System (DES)](http://des.sourceforge.net/)
by Fernando Saenz-Perez.
They progressively introduce the features of the Datamog language.

Each tutorial builds on the previous ones, but they can also be worked through
independently.

| # | Tutorial | Concepts |
|---|----------|----------|
| 1 | [Introduction to Datamog](01-introduction.md) | Facts, rules, queries, extensional data |
| 2 | [Find the thief](02-find-the-thief.md) | Comparisons, negation, disjunction, aggregates |
| 3 | [Catch the fire starter](03-catch-the-fire-starter.md) | Derived predicates, rule composition, negation |
| 4 | [Crown the rightful heir](04-crown-the-rightful-heir.md) | Recursion, transitive closure, ancestor queries |
| 5 | [Cross the river](05-cross-the-river.md) | State-space search, recursive modeling, safety constraints |
| 6 | [Find the shortest path](06-find-the-shortest-path.md) | Recursion + aggregation, graph optimization |

## Running the examples

Each tutorial includes complete, runnable Datamog programs. To run them:

```bash
bun run datamog <file.dl>
```

To see the generated SQL without executing it:

```bash
bun run datamog --dry-run <file.dl>
```

The complete solutions for tutorials 2--6 are in `packages/cli/examples/`.
