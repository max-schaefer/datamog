# datamog-core

AST type definitions and program analyzer for the Datamog Datalog system.

## AST Types

The core AST represents a Datamog program as a list of statements:

- **`Term`** — `Variable`, `StringLiteral`, or `NumberLiteral`
- **`Atom`** — a predicate applied to terms, e.g. `ancestor(X, Y)`
- **`ExtDecl`** — extensional predicate declaration with typed columns
- **`Rule`** — a Horn clause with a head atom and body atoms (empty body = fact)
- **`Query`** — a `?-` query against a predicate
- **`Program`** — a list of statements

All nodes carry a `Span` for source location tracking.

## Analyzer

`analyze(program)` classifies predicates, builds a dependency graph, and detects recursion:

```ts
import { analyze } from "datamog-core";

const result = analyze(program);
result.extDecls;           // Map<string, ExtDecl> — extensional predicates
result.rules;              // Map<string, Rule[]> — intensional predicates
result.queries;            // Query[]
result.recursivePredicates; // Set<string> — self-recursive predicates
result.sortedPredicates;   // string[] — topological order for view creation
```

Mutual recursion is not supported in v1 and will throw an error.
