# Case studies

A puzzle-driven companion to the main tutorial. Each chapter poses a
problem, then builds up a Datamog solution end-to-end. Adapted from
the [CodeQL QL tutorials][codeql], examples in the
[Datalog Educational System (DES)][des] by Fernando Sáenz-Pérez,
and the [Soufflé tutorial][souffle].

These chapters predate the [language walkthrough](../walkthrough/README.md),
so they overlap with it on language features. Read them after Parts I–IV
when you want to see the language applied end-to-end on bigger
problems, or as a parallel motivation-first track if you prefer
puzzle-solving over feature-by-feature exposition.

| # | Case study | Concepts |
|---|------------|----------|
| 1 | [Introduction to Datamog](01-introduction.md) | Facts, rules, queries, extensional data |
| 2 | [Find the thief](02-find-the-thief.md) | Comparisons, negation, disjunction, aggregates |
| 3 | [Catch the fire starter](03-catch-the-fire-starter.md) | Derived predicates, rule composition, negation |
| 4 | [Crown the rightful heir](04-crown-the-rightful-heir.md) | Recursion, transitive closure, ancestor queries |
| 5 | [Cross the river](05-cross-the-river.md) | State-space search, recursive modeling, safety constraints |
| 6 | [Find the shortest path](06-find-the-shortest-path.md) | Recursion + aggregation, graph optimization |
| 7 | [Analyze a program](07-analyze-a-program.md) | Static analysis, data-flow, pointer analysis |
| 8 | [Prove a theorem](08-prove-a-theorem.md) | CNF, value invention, parsing, non-linear recursion, sequent calculus |

The complete solutions for case studies 2–8 are in
`packages/cli/examples/`. To run a program:

```bash
bun run datamog <file.dl>
bun run datamog --dry-run <file.dl>   # print generated SQL instead
```

Case study 8 spans four example directories (`cnf-falsifiability`,
`cnf-from-ast`, `cnf-tseitin`, `parse-to-cnf`) and uses non-linear recursion,
so run its later parts on an in-memory backend:

```bash
bun run datamog --backend seminaive <file.dl>
```

[codeql]: https://codeql.github.com/docs/writing-codeql-queries/ql-tutorials/
[des]: http://des.sourceforge.net/
[souffle]: https://souffle-lang.github.io/tutorial
