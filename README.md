# Datamog

<p align="center">
  <img src="datamog.jpg" alt="Datamog" width="300" />
</p>

Datamog is an educational Datalog dialect that translates into SQL. It supports Horn clauses with extensional predicate declarations, stratified negation, and aggregates, and compiles rules into views (including recursive views for recursive predicates). It ships with Postgres, SQLite, DuckDB, and sql.js backends, and a VS Code extension for editor support.

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
- **Negation**: `not pred(X)` in a rule body compiles to `NOT EXISTS`. Negation must be stratifiable (no negation within recursive cycles).
- **Aggregates**: aggregate functions in rule heads define grouped views. Non-aggregate head arguments become `GROUP BY` columns:
  ```datalog
  num_children(P, count(C)) :- parent(P, C).
  total_score(sum(S)) :- scores(_, S).
  ```
  Supported functions: `count`, `sum`, `avg`, `min`, `max`, `group_concat`. Use `count(_)` for `COUNT(*)`. Aggregate predicates cannot be recursive.
- **Arithmetic**: `+`, `-`, `*`, `/`, `mod` in expressions. Operator precedence follows standard conventions.
- **Comparisons**: `<`, `>`, `<=`, `>=`, `!=` in rule bodies.
- **Equalities**: `X = expr` binds a variable to an expression.
- **Ranges**: `X in [1 .. 10]` generates integers (or filters values) within bounds.
- **String operations**: `+` on strings is concatenation, `len(X)` returns length, `X[0]` is subscript, `X[1:3]` is slice.
- **Don't-care variable**: `_` matches anything and is automatically renamed to a unique variable at each occurrence.
- **Queries** (`?-`) execute `SELECT` statements against the generated views.
- **Comments** start with `%` and run to end of line.

## Packages

| Package | Description |
|---------|-------------|
| `datamog-parser` | Langium grammar, generated parser, and AST type definitions |
| `datamog-core` | Program analyzer (safety checking, dependency graph, recursion detection, type inference) |
| `datamog-engine` | SQL translator, executor, and pluggable loader interface |
| `datamog-backend-postgres` | Postgres backend (via `Bun.sql`) |
| `datamog-backend-sqlite` | SQLite backend (via `bun:sqlite`, in-memory by default) |
| `datamog-backend-duckdb` | DuckDB backend (via `@duckdb/node-api`, supports non-linear recursion) |
| `datamog-backend-sqljs` | sql.js backend (SQLite compiled to WASM via `sql.js`) |
| `datamog-csv` | Loader plugin for CSV files |
| `datamog-jsonl` | Loader plugin for JSONL files |
| `datamog-gsheet` | Loader plugin for Google Sheets |
| `datamog-mermaid` | Loader plugin for Mermaid graph/flowchart files (`.mmd`) |
| `datamog-cli` | Command-line interface |
| `datamog-vscode` | VS Code extension with syntax highlighting and diagnostics |

## Usage

Run with the CLI (no database setup needed — uses in-memory DuckDB by default):

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
bun run datamog --backend duckdb packages/cli/examples/family/family.dl
bun run datamog --backend sqljs packages/cli/examples/family/family.dl
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog --backend postgres program.dl
```

The CLI auto-discovers data files in the same directory as the `.dl` file: `<predicate>.csv`, `<predicate>.jsonl`, or `<predicate>.mmd` (Mermaid graph). You can also load data from Google Sheets — see the [datamog-gsheet README](packages/loader/gsheet/README.md) for setup instructions.

### Examples

| Example | Description | Command |
|---------|-------------|---------|
| `family` | Ancestor relation via transitive closure | `bun run datamog packages/cli/examples/family/family.dl` |
| `graph` | Reachability in a directed graph | `bun run datamog packages/cli/examples/graph/graph.dl` |
| `courses` | Transitive course prerequisites | `bun run datamog packages/cli/examples/courses/courses.dl` |
| `social` | Mutual friends (JSONL data) | `bun run datamog packages/cli/examples/social/social.dl` |
| `aggregates` | Aggregate functions on student scores | `bun run datamog packages/cli/examples/aggregates/aggregates.dl` |
| `negation` | Stratified negation for graph frontier | `bun run datamog packages/cli/examples/negation/negation.dl` |
| `arithmetic` | Arithmetic expressions and comparisons | `bun run datamog packages/cli/examples/arithmetic/arithmetic.dl` |
| `strings` | String concatenation, length, subscript, slice | `bun run datamog packages/cli/examples/strings/strings.dl` |
| `bill-of-materials` | Supply chain with transitive closure and negation | `bun run datamog packages/cli/examples/bill-of-materials/bom.dl` |
| `flights` | Flight connections with travel time | `bun run datamog packages/cli/examples/flights/flights.dl` |
| `grammar` | Left-recursive grammar recognizer using string ops | `bun run datamog packages/cli/examples/grammar/grammar.dl` |
| `same-generation` | Same-generation (cousin) problem with mutual recursion | `bun run datamog packages/cli/examples/same-generation/same-generation.dl` |
| `river-crossing` | Farmer, wolf, goat, and cabbage puzzle | `bun run datamog packages/cli/examples/river-crossing/river-crossing.dl` |
| `propositional-logic` | Propositional formula evaluator and tautology checker | `bun run datamog packages/cli/examples/propositional-logic/propositional-logic.dl` |

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

## VS Code Extension

The `datamog-vscode` package provides a VS Code extension with syntax highlighting, live parse-error diagnostics, and semantic validation (arity mismatches, unsafe variables, unstratifiable negation, etc.).

### Build and install

```bash
bun run build:vscode
code --install-extension packages/vscode-extension/datamog.vsix
```

For development, open the `packages/vscode-extension` folder in VS Code and press **F5** to launch an Extension Development Host with the extension loaded.

### Features

- Syntax highlighting for `.dl` files
- Live parse-error diagnostics (powered by the Langium parser)
- Semantic diagnostics from the Datamog analyzer (arity errors, safety violations, stratification errors, aggregate validation)
- Bracket matching and auto-closing for `()`, `[]`, and `""`
- Comment toggling with `%`

## Development

```bash
bun install          # install dependencies
bun test             # run all tests
bun run check        # lint and format check (biome)
bun run check:fix    # auto-fix lint and format issues
```
