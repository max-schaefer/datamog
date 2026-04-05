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
| `datamog-core` | AST type definitions and program analyzer (dependency graph, recursion detection) |
| `datamog-parser` | Lexer and recursive-descent parser producing a typed AST |
| `datamog-postgres` | SQL translator with pluggable extensional loading |
| `datamog-csv` | Loader plugin for populating extensional predicates from CSV files |
| `datamog-cli` | Command-line interface for running Datamog programs |

## Usage

Given a Datalog program `family.dl`:

```datalog
extensional parent(name: text, child: text).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

?- ancestor("alice", X).
```

And a CSV file `data/parent.csv` (matching the extensional predicate name):

```csv
name,child
alice,bob
bob,carol
bob,dave
```

Run it with the CLI (a complete example lives in `packages/cli/example/`):

```bash
# Preview the generated SQL without connecting to Postgres
bun run datamog --dry-run packages/cli/example/family.dl

# Execute against Postgres, loading CSVs from the same directory as the .dl file
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog packages/cli/example/family.dl

# Or specify a separate CSV directory
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog family.dl ./data
```

The CLI looks for `<predicate>.csv` files (e.g. `parent.csv`) in the CSV directory, which defaults to the directory containing the `.dl` file.

### Programmatic API

You can also use the packages directly:

```ts
import { DatamogExecutor } from "datamog-postgres";
import { CsvLoader } from "datamog-csv";

const sql = Bun.sql;
const executor = new DatamogExecutor(sql, [
  new CsvLoader({ directory: "./data" }),
]);

const source = await Bun.file("family.dl").text();
const results = await executor.execute(source);

for (const result of results) {
  console.log(result.sql);
  console.table(result.rows);
}
```

## Development

```bash
bun install          # install dependencies
bun test             # run all tests
bun run check        # lint and format check (biome)
bun run check:fix    # auto-fix lint and format issues
```
