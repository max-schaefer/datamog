# datamog-postgres

Translates Datamog programs into Postgres SQL and executes them with pluggable extensional data loading.

## Translation

```ts
import { parse } from "datamog-parser";
import { analyze } from "datamog-core";
import { translate } from "datamog-postgres";

const program = parse(source);
const analyzed = analyze(program);
const result = translate(analyzed);

result.createTables; // CREATE TABLE statements for extensional predicates
result.createViews;  // CREATE [RECURSIVE] VIEW statements for intensional predicates
result.queries;      // SELECT statements for queries
```

- Extensional predicates become `CREATE TABLE IF NOT EXISTS` with declared column names.
- Non-recursive intensional predicates become `CREATE OR REPLACE VIEW`.
- Recursive intensional predicates become `CREATE RECURSIVE VIEW` using `UNION` of base and recursive cases.
- Queries become `SELECT` statements with `WHERE` clauses for constant arguments.

## Executor

`DatamogExecutor` orchestrates the full pipeline (create tables, load data, create views, run queries):

```ts
import { DatamogExecutor } from "datamog-postgres";

const executor = new DatamogExecutor(Bun.sql, [loader1, loader2]);
const results = await executor.execute(source);
```

## Extensional Loader Interface

Implement `ExtensionalLoader` to add custom data sources:

```ts
import type { ExtensionalLoader } from "datamog-postgres";

const myLoader: ExtensionalLoader = {
  name: "my-loader",
  async canLoad(decl) { /* return true if you can handle this predicate */ },
  async load(decl, sql) { /* INSERT rows into the table */ },
};
```
