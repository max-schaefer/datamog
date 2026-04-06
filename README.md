# Datamog

Datamog is an educational Datalog dialect that translates into SQL. It supports negation-free Horn clauses with extensional predicate declarations, and compiles rules into views (including recursive views for recursive predicates). It ships with Postgres and SQLite backends.

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

- **Extensional declarations** (`extensional`) define predicates backed by tables with typed columns (`text`, `integer`, `real`, `boolean`).
- **Rules** define intensional predicates. Multiple rules for the same predicate are combined with `UNION`. Recursive predicates use recursive views.
- **Facts** are rules with no body: `base_case("x").`
- **Queries** (`?-`) execute `SELECT` statements against the generated views.
- **Comments** start with `%` and run to end of line.

## Packages

| Package | Description |
|---------|-------------|
| `datamog-core` | AST type definitions and program analyzer (dependency graph, recursion detection) |
| `datamog-parser` | Lexer and recursive-descent parser producing a typed AST |
| `datamog-engine` | SQL translator, executor, and pluggable loader interface |
| `datamog-backend-postgres` | Postgres backend (via `Bun.sql`) |
| `datamog-backend-sqlite` | SQLite backend (via `bun:sqlite`, in-memory by default) |
| `datamog-csv` | Loader plugin for populating extensional predicates from CSV files |
| `datamog-cli` | Command-line interface for running Datamog programs |

## Usage

Run with the CLI (no database setup needed — uses in-memory SQLite by default):

```bash
bun run datamog packages/cli/examples/family/family.dl
```

Or preview the generated SQL:

```bash
bun run datamog --dry-run packages/cli/examples/family/family.dl
```

Select a backend explicitly:

```bash
bun run datamog --backend sqlite packages/cli/examples/family/family.dl
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog --backend postgres program.dl
```

The CLI looks for `<predicate>.csv` files (e.g. `parent.csv`) in the same directory as the `.dl` file.

### Examples

| Example | Description | Command |
|---------|-------------|---------|
| `family` | Ancestor relation via transitive closure | `bun run datamog packages/cli/examples/family/family.dl` |
| `graph` | Reachability in a directed graph | `bun run datamog packages/cli/examples/graph/graph.dl` |
| `courses` | Transitive course prerequisites | `bun run datamog packages/cli/examples/courses/courses.dl` |

### Programmatic API

```ts
import { DatamogExecutor } from "datamog-engine";
import { CsvLoader } from "datamog-csv";
import { create as createBackend } from "datamog-backend-sqlite";

const backend = createBackend();
const executor = new DatamogExecutor(backend, [
  new CsvLoader({ directory: "./data" }),
]);

const source = await Bun.file("family.dl").text();
const results = await executor.execute(source);

for (const result of results) {
  console.log(result.sql);
  console.table(result.rows);
}

await backend.close();
```

## Development

```bash
bun install          # install dependencies
bun test             # run all tests
bun run check        # lint and format check (biome)
bun run check:fix    # auto-fix lint and format issues
```
