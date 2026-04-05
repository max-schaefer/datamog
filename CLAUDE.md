# Datamog

Educational Datalog → SQL translator. TypeScript/Bun monorepo.

## Commands

- `bun test` — run all tests
- `bun run check` — lint + format check (biome)
- `bun run check:fix` — auto-fix lint + format
- `bun run datamog <file.dl>` — run a program (in-memory SQLite; set `DATABASE_URL` for Postgres)

## Packages

- `packages/core` — AST types, program analyzer (no deps)
- `packages/parser` — lexer, recursive descent parser (depends on core)
- `packages/postgres` — SQL translator, executor, loader interface (depends on core + parser)
- `packages/csv` — CSV loader plugin (depends on core + postgres)
- `packages/cli` — CLI (depends on all four)
