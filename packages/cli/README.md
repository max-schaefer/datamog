# datamog-cli

Command-line interface for running Datamog programs against Postgres.

## Usage

```bash
# Preview generated SQL without connecting to Postgres
bun datamog --dry-run program.dl

# Execute against Postgres, loading CSVs from the same directory as the .dl file
DATABASE_URL=postgres://localhost:5432/mydb bun datamog program.dl

# Specify a separate CSV directory
DATABASE_URL=postgres://localhost:5432/mydb bun datamog program.dl ./data
```

The CLI looks for `<predicate>.csv` files in the CSV directory, which defaults to the directory containing the `.dl` file.

## Example

An example program is included in `example/`:

```bash
bun datamog --dry-run packages/cli/example/family.dl
```
