# Datamog — Project Instructions

## Commands

```bash
bun test                    # run all tests (62 tests across 7 packages)
bun run check               # biome lint + format check
bun run check:fix           # auto-fix lint + format
bun run datamog <file.dl>   # run a Datamog program (in-memory SQLite)
bun run datamog --dry-run <file.dl>  # preview generated SQL
bun run datamog --backend postgres <file.dl>  # use Postgres backend
```

## Architecture

Monorepo with Bun workspaces. Dependency graph:

```
core (AST types, analyzer)
  ↑
parser (lexer, recursive descent parser)
  ↑
engine (SQL translator, executor, Backend interface, loader interface)
  ↑        ↑
  |    backend/postgres (Bun.sql)
  |    backend/sqlite (bun:sqlite)
  ↑
loader/csv (CSV loader plugin)
  ↑
cli (imports all packages, selects backend via --backend flag)
```

### Key modules

- `packages/core/src/ast.ts` — all AST node types (discriminated unions via `kind` field)
- `packages/core/src/analyzer.ts` — EDB/IDB classification, dependency graph, Tarjan's SCC for recursion detection, topological sort
- `packages/parser/src/lexer.ts` — hand-written tokenizer
- `packages/parser/src/parser.ts` — recursive descent parser
- `packages/engine/src/backend.ts` — `Backend` interface (implement to add new databases)
- `packages/engine/src/translator.ts` — AST → SQL generation with `postgres` and `sqlite` dialects
- `packages/engine/src/loader.ts` — `ExtensionalLoader` plugin interface
- `packages/backend/postgres/src/index.ts` — `createPostgresBackend()` using `Bun.sql`
- `packages/backend/sqlite/src/index.ts` — `createSqliteBackend()` using `bun:sqlite`

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
- `Backend` is the abstraction for database connections — implement it to add new databases
