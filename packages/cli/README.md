# datamog-cli

Command-line interface for running Datamog programs. Uses in-memory SQLite by default, or Postgres when `DATABASE_URL` is set.

## Usage

```bash
# Run with in-memory SQLite (no database setup needed)
bun run datamog program.dl

# Run against Postgres
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog program.dl

# Specify a separate CSV directory
bun run datamog program.dl ./data

# Preview generated SQL without executing
bun run datamog --dry-run program.dl

# Force a specific SQL dialect
bun run datamog --dialect postgres --dry-run program.dl
bun run datamog --dialect sqlite --dry-run program.dl
```

The CLI looks for `<predicate>.csv` files in the CSV directory, which defaults to the directory containing the `.dl` file.

## Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Print generated SQL without executing |
| `--dialect <postgres\|sqlite>` | SQL dialect (default: auto-detected from `DATABASE_URL`) |
| `-h`, `--help` | Show help message |

## Example

A complete example is included in `example/`:

```bash
bun run datamog packages/cli/example/family.dl
```
