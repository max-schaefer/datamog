# Datamog — Project Instructions

Educational Datalog → SQL translator. TypeScript/Bun monorepo. Uses **bun** as package manager and runtime — do not use pnpm/npm/yarn.

## Commands

```bash
bun test                    # run all tests
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
- `packages/core/src/analyzer.ts` — EDB/IDB classification, arity tracking, safety checking, dependency graph, Tarjan's SCC, recursion detection
- `packages/core/src/types.ts` — type inference (fixed-point iteration) and type validation for range atoms
- `packages/parser/src/lexer.ts` — hand-written tokenizer; keywords in `KEYWORDS` map, two-char ops checked before single-char `punctMap`
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

## Adding a new language feature

Typical touch points (in dependency order):

1. **AST** (`core/src/ast.ts`): add interface with `kind` discriminant extending `SourceElement`, update `BodyElement`/`Term` union
2. **Core exports** (`core/src/index.ts`): export the new type
3. **Lexer** (`parser/src/lexer.ts`): add new `TokenType` enum values, keywords in `KEYWORDS` map, multi-char ops before single-char `punctMap`
4. **Parser** (`parser/src/parser.ts`): handle in `parseBodyElement()` (body elements) or expression parsing chain; watch for ambiguity with existing dispatch (ident+lparen → atom vs function call, variable+equals → equality)
5. **Analyzer** (`core/src/analyzer.ts`): update `checkSafety()` — phase 1 collects safe vars (fixed-point for equalities/ranges), phase 2 checks all body elements left-to-right
6. **Type inference** (`core/src/types.ts`): update var type environment building in the fixed-point loop, add validation if needed
7. **Translator** (`engine/src/translator.ts`): update `translateRule()` — single left-to-right pass over body elements registers bindings and categorizes into positiveAtoms/negatedAtoms/comparisons/bindingRanges/filterRanges; FROM/WHERE assembled from these

## SQLite vs Postgres dialect differences

- Bun's embedded SQLite does **not** have `generate_series`; use recursive CTE subqueries instead
- SQLite: `CREATE VIEW IF NOT EXISTS`; Postgres: `CREATE OR REPLACE VIEW`
- SQLite mutual recursion: combined CTE with `__tag` discriminator column
- Postgres mutual recursion: multiple CTEs in `WITH RECURSIVE` block
- `translateRule()` receives `dialect` parameter (passed through from `translateViews`)

## Conventions

- Hand-written parser — no parser generator or combinator library (educational transparency)
- `SourcePosition` on every AST node via `SourceElement` base interface
- `ParseError` with line/column for user-facing error messages, `AnalyzerError` for semantic errors
- Tests use `bun:test` with TDD approach
- `Backend` is the abstraction for database connections — implement it to add new databases
- Loaders use `coerceValue` (string → typed, for CSV/GSheet) or `checkValue` (native type validation, for JSONL)
- Example tests (`cli/test/examples.test.ts`) auto-generate `expected.json` if missing; delete it to regenerate
