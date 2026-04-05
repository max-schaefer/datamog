# Datamog

Educational Datalog → Postgres translator. TypeScript/Bun monorepo.

## Stack

- **Runtime:** Bun (not Node.js)
- **Language:** TypeScript (strict mode)
- **Database:** Postgres via `Bun.sql` (not `pg` or `postgres.js`)
- **Linting/Formatting:** Biome (not Prettier/ESLint)
- **Testing:** `bun test`

## Commands

- `bun test` — run all tests (recursive across packages)
- `bun run check` — lint + format check (biome)
- `bun run check:fix` — auto-fix lint + format issues

## Packages

- `packages/parser` — lexer, parser, AST types (no deps)
- `packages/postgres` — analyzer, SQL translator, loader interface (depends on parser)
- `packages/csv` — CSV loader plugin (depends on parser + postgres)

## Conventions

- Bun auto-loads `.env` — no dotenv needed
- Prefer `Bun.file` over `node:fs`
- Use `Promise.allSettled` over `Promise.all`
- IDB views use positional column names (`col1`, `col2`, ...)
- EDB tables use declared column names from `.ext` declarations
