# datamog-cli

Command-line interface for running Datamog programs. Uses in-memory SQLite (`bun:sqlite`) by default, or Postgres when `DATABASE_URL` is set.

## Usage

```bash
# Start the interactive REPL
bun run datamog

# Start the ndjson REPL used by integrations
bun run datamog --json

# Run with in-memory SQLite (no database setup needed)
bun run datamog program.dl

# Run against Postgres
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog program.dl

# Select a backend explicitly
bun run datamog --backend sqlite program.dl
bun run datamog --backend postgres program.dl
bun run datamog --backend sqljs program.dl
bun run datamog --backend native program.dl
bun run datamog --backend seminaive program.dl

# Specify a separate data directory
bun run datamog program.dl ./data

# Load a predicate from a specific file or HTTP(S) URL
bun run datamog --extensional parent=/path/to/parents.csv program.dl
bun run datamog --extensional parent=https://example.com/parents.csv program.dl

# Load a predicate from a Google Sheet (requires GOOGLE_API_KEY)
GOOGLE_API_KEY=... bun run datamog \
  --extensional scores=https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit \
  program.dl

# Multiple explicit sources
bun run datamog \
  --extensional edges=graph.csv \
  --extensional weights=weights.jsonl \
  program.dl

# Preview generated SQL without executing
bun run datamog --dry-run program.dl
```

## Loading data

By default, the CLI looks for data files in the data directory (the directory containing the `.dl` file, or an explicit second argument). You can override this for individual predicates with `--extensional name=source`, where `source` is a local path, an HTTP(S) URL ending in a supported extension, a Google Sheets share URL, or a GitHub shorthand (`github:OWNER/REPO/PATH[#REF]`, `gh:` alias; `REF` defaults to `HEAD`).

Five formats are supported:

### CSV

Place a file named `<predicate>.csv` in the data directory. The first row is treated as a header by default.

```
name,child
alice,bob
bob,carol
```

### JSONL

Place a file named `<predicate>.jsonl` in the data directory. Each line is a JSON object containing the declared columns; extra fields are ignored. Values should use native JSON types (numbers, booleans), not strings.

```jsonl
{"name": "alice", "follows": "bob"}
{"name": "bob", "follows": "carol"}
```

A single-`value`-column extensional consumes each line as the column's whole contents (any JSON shape goes), bypassing the field-mapping step.

### JSON (whole file)

Place a file named `<predicate>.json` in the data directory. The extensional declaration must have exactly one `value`-typed column; the file is parsed and inserted as a single row. This is the natural shape for config blobs and manifests.

### Mermaid

Place a file named `<predicate>.mmd` (a Mermaid `graph TD` / `graph LR` block) in the data directory. The loader extracts edges as `(source, target)` pairs — a convenient way to author small graph EDBs that double as illustrations in markdown.

### Google Sheets

Pass a Google Sheets share URL via `--extensional`:

```bash
# Public spreadsheets work without any auth configuration
bun run datamog \
  --extensional scores=https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit \
  program.dl

# For private sheets, set GOOGLE_API_KEY or service account credentials
GOOGLE_API_KEY=... bun run datamog \
  --extensional scores=https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit \
  program.dl
```

The sheet must have a header row with column names matching the `extensional` declaration. Public spreadsheets are fetched via CSV export and require no credentials. For private sheets, set `GOOGLE_API_KEY` or `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`.

## Options

| Option | Description |
|--------|-------------|
| `--extensional name=source` | Map a predicate to a local file or HTTP(S) URL (`.csv`, `.jsonl`, `.json`, `.mmd`), a Google Sheets URL, or a GitHub shorthand `github:OWNER/REPO/PATH[#REF]` (`gh:` alias) |
| `--data-dir <path>` | Directory loaders read from in `--repl` mode (defaults to the current working directory) |
| `--output-format <format>` | Output format: `table` (default), `csv`, `jsonl`, `jsonl-flat`, `mermaid`, or `ascii-graph` |
| `--csv-no-header` | CSV files have no header row (columns are matched by position) |
| `--dry-run` | Print generated SQL without executing |
| `--warn-finiteness` | Print a warning for each predicate column whose values may grow unboundedly across iterations |
| `--repl` | Start the REPL explicitly (this is the default when no `program.dl` is given) |
| `--json` | In REPL mode, emit one ndjson event per declaration, rule, query, or command |
| `--backend <postgres\|sqlite\|sqljs\|native\|seminaive>` | Backend (default: auto-detected from `DATABASE_URL`) |
| `-h`, `--help` | Show help message |

## Examples

The `examples/` directory holds 40+ runnable programs covering transitive closure, stratified negation, aggregates, mutual recursion, classic puzzles, JSON/`value` handling, propositional logic, and Boolean-circuit solvers. Run any of them with:

```bash
bun run datamog packages/cli/examples/<name>/<name>.dl
```

Some use non-linear recursion (rejected by the SQL backends); those carry a `native-only` marker file and run on `--backend native` or `--backend seminaive`.
