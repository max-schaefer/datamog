# Datamog — Project Instructions

Educational Datalog → SQL translator. TypeScript/Bun monorepo.

## Commands

```bash
bun test                    # run all tests (96 tests across 7 packages)
bun run typecheck           # tsc -b (project references, emits .d.ts only)
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
loader/csv, loader/jsonl, loader/gsheet
  ↑
cli (imports all packages, selects backend via --backend flag)
```

### Key modules

- `packages/core/src/ast.ts` — AST node types (discriminated unions via `kind` field), `SourcePosition`, `SourceElement`
- `packages/core/src/analyzer.ts` — EDB/IDB classification, arity tracking, dependency graph, Tarjan's SCC, recursion detection
- `packages/parser/src/lexer.ts` — hand-written tokenizer
- `packages/parser/src/parser.ts` — recursive descent parser, don't-care variable (`_`) desugaring
- `packages/engine/src/backend.ts` — `Backend` interface (implement to add new databases)
- `packages/engine/src/translator.ts` — AST → SQL generation with `postgres` and `sqlite` dialects
- `packages/engine/src/loader.ts` — `ExtensionalLoader` plugin interface, `coerceValue`/`checkValue` for type validation

## Datalog semantics

- **Extensional (EDB)**: declared with `extensional`, backed by tables, data loaded via plugins
- **Intensional (IDB)**: defined by rules, compiled to views
- Non-recursive IDB → `CREATE [OR REPLACE] VIEW` (postgres) / `CREATE VIEW IF NOT EXISTS` (sqlite)
- Recursive IDB → `CREATE RECURSIVE VIEW` (postgres) / `CREATE VIEW ... WITH RECURSIVE` (sqlite)
- Mutually recursive IDB → shared `WITH RECURSIVE` block with co-dependent CTEs
- Multiple rules for the same predicate → `UNION`
- IDB views use positional column names (`col1`, `col2`, ...), EDB tables use declared names
- Don't-care variable `_` is desugared to unique anonymous variables in the parser

## Conventions

- No negation (pure, negation-free Datalog)
- Hand-written parser — no parser generator or combinator library (educational transparency)
- `SourcePosition` on every AST node via `SourceElement` base interface
- `ParseError` with line/column for user-facing error messages, `AnalyzerError` for semantic errors
- Tests use `bun:test` with TDD approach
- `Backend` is the abstraction for database connections — implement it to add new databases
- Loaders use `coerceValue` (string → typed, for CSV/GSheet) or `checkValue` (native type validation, for JSONL)
