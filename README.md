# Datamog

Datamog is an educational Datalog dialect that translates into Postgres. It supports negation-free Horn clauses with extensional predicate declarations, and compiles rules into Postgres views (including recursive views for recursive predicates).

## Syntax

```datalog
% Declare extensional predicates (backed by tables)
extensional parent(name: text, child: text).

% Define rules (Horn clauses)
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

% Query
?- ancestor("alice", X).
```

- **Extensional declarations** (`extensional`) define predicates backed by Postgres tables with typed columns (`text`, `integer`, `real`, `boolean`).
- **Rules** define intensional predicates. Multiple rules for the same predicate are combined with `UNION`. Recursive predicates use `CREATE RECURSIVE VIEW`.
- **Facts** are rules with no body: `base_case("x").`
- **Queries** (`?-`) execute `SELECT` statements against the generated views.
- **Comments** start with `%` and run to end of line.

## Packages

| Package | Description |
|---------|-------------|
| `datamog-parser` | Lexer and recursive-descent parser producing a typed AST |
| `datamog-postgres` | Analyzer (dependency graph, recursion detection) and SQL translator with pluggable extensional loading |
| `datamog-csv` | Loader plugin for populating extensional predicates from CSV files |

## Development

```bash
bun install          # install dependencies
bun test             # run all tests
bun run check        # lint and format check (biome)
bun run check:fix    # auto-fix lint and format issues
```
