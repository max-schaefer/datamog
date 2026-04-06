# datamog-cli

Command-line interface for running Datamog programs. Uses in-memory SQLite by default, or Postgres when `DATABASE_URL` is set.

## Usage

```bash
# Run with in-memory SQLite (no database setup needed)
bun run datamog program.dl

# Run against Postgres
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog program.dl

# Select a backend explicitly
bun run datamog --backend sqlite program.dl
bun run datamog --backend postgres program.dl

# Specify a separate CSV directory
bun run datamog program.dl ./data

# Preview generated SQL without executing
bun run datamog --dry-run program.dl
```

The CLI looks for `<predicate>.csv` files in the CSV directory, which defaults to the directory containing the `.dl` file.

## Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Print generated SQL without executing |
| `--backend <postgres\|sqlite>` | Backend (default: auto-detected from `DATABASE_URL`) |
| `-h`, `--help` | Show help message |

## Examples

Several examples are included in `examples/`:

| Example | Description | Command |
|---------|-------------|---------|
| `family` | Ancestor relation via transitive closure | `bun run datamog packages/cli/examples/family/family.dl` |
| `graph` | Reachability in a directed graph | `bun run datamog packages/cli/examples/graph/graph.dl` |
| `courses` | Transitive course prerequisites | `bun run datamog packages/cli/examples/courses/courses.dl` |
| `social` | Mutual friends (JSONL data) | `bun run datamog packages/cli/examples/social/social.dl` |
