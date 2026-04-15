# datamog-cli

Command-line interface for running Datamog programs. Uses in-memory DuckDB by default, or Postgres when `DATABASE_URL` is set.

## Usage

```bash
# Run with in-memory DuckDB (no database setup needed)
bun run datamog program.dl

# Run against Postgres
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog program.dl

# Select a backend explicitly
bun run datamog --backend sqlite program.dl
bun run datamog --backend postgres program.dl
bun run datamog --backend duckdb program.dl
bun run datamog --backend sqljs program.dl

# Specify a separate data directory
bun run datamog program.dl ./data

# Load a predicate from a specific file
bun run datamog --extensional parent=/path/to/parents.csv program.dl

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

By default, the CLI looks for data files in the data directory (the directory containing the `.dl` file, or an explicit second argument). You can override this for individual predicates with `--extensional name=source`.

Three formats are supported:

### CSV

Place a file named `<predicate>.csv` in the data directory. The first row is treated as a header by default.

```
name,child
alice,bob
bob,carol
```

### JSONL

Place a file named `<predicate>.jsonl` in the data directory. Each line is a JSON object with field names matching the declared columns. Values should use native JSON types (numbers, booleans), not strings.

```jsonl
{"name": "alice", "follows": "bob"}
{"name": "bob", "follows": "carol"}
```

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
| `--extensional name=source` | Map a predicate to a file (.csv/.jsonl) or Google Sheets URL |
| `--output-format <format>` | Output format: `table` (default), `csv`, or `jsonl` |
| `--dry-run` | Print generated SQL without executing |
| `--backend <postgres\|sqlite\|duckdb\|sqljs>` | Backend (default: auto-detected from `DATABASE_URL`) |
| `-h`, `--help` | Show help message |

## Examples

Several examples are included in `examples/`:

| Example | Description | Data format |
|---------|-------------|-------------|
| `family` | Ancestor relation via transitive closure | CSV |
| `graph` | Reachability in a directed graph | CSV |
| `courses` | Transitive course prerequisites | CSV |
| `social` | Mutual friends | JSONL |
| `grammar` | CYK-style parsing | CSV |
| `same-generation` | Same-generation query | CSV |
| `river-crossing` | Farmer/wolf/goat/cabbage puzzle | (facts only) |
| `negation` | Reachable frontier via stratified negation | CSV |

Run any example with:

```bash
bun run datamog packages/cli/examples/<name>/<name>.dl
```
