# Datamog — Project Instructions

## Commands

```bash
bun test                    # run all tests (62 tests across 5 packages)
bun run check               # biome lint + format check
bun run check:fix           # auto-fix lint + format
bun run datamog <file.dl>   # run a Datamog program (in-memory SQLite)
bun run datamog --dry-run <file.dl>  # preview generated SQL
```

## Architecture

Monorepo with Bun workspaces. Dependency graph:

```
core (AST types, analyzer)
  ↑
parser (lexer, recursive descent parser)
  ↑
postgres (SQL translator, executor, loader interface, SQLite adapter)
  ↑
csv (CSV loader plugin)
  ↑
cli (command-line interface)
```

### Key modules

- `packages/core/src/ast.ts` — all AST node types (discriminated unions via `kind` field)
- `packages/core/src/analyzer.ts` — EDB/IDB classification, dependency graph, Tarjan's SCC for recursion detection, topological sort
- `packages/parser/src/lexer.ts` — hand-written tokenizer
- `packages/parser/src/parser.ts` — recursive descent parser
- `packages/postgres/src/translator.ts` — AST → SQL generation with `postgres` and `sqlite` dialects
- `packages/postgres/src/loader.ts` — `ExtensionalLoader` plugin interface
- `packages/postgres/src/sqlite-adapter.ts` — wraps `bun:sqlite` to match `BunSQL` interface

## Datalog semantics

- **Extensional (EDB)**: declared with `extensional`, backed by tables, data loaded via plugins
- **Intensional (IDB)**: defined by rules, compiled to views
- Non-recursive IDB → `CREATE [OR REPLACE] VIEW` (postgres) / `CREATE VIEW IF NOT EXISTS` (sqlite)
- Recursive IDB → `CREATE RECURSIVE VIEW` (postgres) / `CREATE VIEW ... WITH RECURSIVE` (sqlite)
- Multiple rules for the same predicate → `UNION`
- IDB views use positional column names (`col1`, `col2`, ...), EDB tables use declared names
- Self-recursion is supported; mutual recursion is rejected with a clear error

## Conventions

- No negation (pure, negation-free Datalog)
- Hand-written parser — no parser generator or combinator library (educational transparency)
- `Span` on every AST node for source location tracking
- `ParseError` with line/column for user-facing error messages
- Tests use `bun:test` with TDD approach (tests written before implementation)
- `BunSQL` is a minimal interface type so the executor works with both `Bun.sql` (Postgres) and `bun:sqlite` (via adapter)
