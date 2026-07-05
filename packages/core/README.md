# datamog-core

AST type definitions, semantic analyzer, and type inference for the Datamog Datalog system.

## AST Types

The core AST re-exports Langium-generated types from `datamog-parser`. A Datamog program is a list of statements:

- **`Expression`** (aliased as `Term`) — `Variable`, `StringLiteral`, `NumberLiteral`, `BooleanLiteral`, `NullLiteral`, `BinaryExpr`, `UnaryExpr`, `FunctionCall`, `Subscript`, `Slice`. The `HeadTerm` union additionally includes the synthesised `AggregateCall` shape for aggregate-position rule heads
- **`Atom`** — a predicate applied to expressions, optionally negated, e.g. `ancestor(X, Y)`, `not composite(X)`
- **`ExtDecl`** — extensional predicate declaration with typed columns
- **`Rule`** — a Horn clause with a head atom and body elements (empty body = fact)
- **`Query`** — a `?-` query against a predicate
- **`Program`** — a list of statements

All nodes carry source positions via Langium's `$cstNode`.

## Analyzer

`analyze(program)` classifies predicates, builds a dependency graph, and detects recursion:

```ts
import { analyze } from "datamog-core";

const result = analyze(program);
result.extDecls;            // Map<string, ExtDecl> — extensional predicates
result.rules;               // Map<string, Rule[]> — intensional predicates
result.queries;             // Query[]
result.recursivePredicates; // Set<string> — recursive predicates (self or mutual)
result.nonLinearPredicates; // Set<string> — predicates with >1 recursive body atom
result.sortedStrata;        // string[][] — SCCs in dependency order
```

The analyzer also checks safety, arity consistency, stratified negation, and aggregate constraints.

## Type Inference

`inferTypes(analyzed)` infers column types for all predicates via fixed-point iteration:

```ts
import { analyze, inferTypes } from "datamog-core";

const typed = inferTypes(analyze(program));
typed.columnTypes; // Map<string, PrimitiveType[]> — column types per predicate
```

Types are: `string`, `integer`, `float`, `boolean`, `value`. Type inference is a fixed-point iteration; columns that the iteration leaves un-pinned are reported as a type-inference error (rather than silently defaulted).
