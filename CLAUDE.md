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
- `packages/postgres` — SQL translator, executor, Backend interface, loader interface
- `packages/backend-postgres` — Postgres backend via Bun.sql
- `packages/backend-sqlite` — SQLite backend via bun:sqlite
- `packages/csv` — CSV loader plugin
- `packages/cli` — CLI
