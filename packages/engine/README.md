# datamog-engine

*Part of the [Datamog](../../README.md) monorepo.*

SQL translator and executor for the Datamog Datalog system. This package provides the shared translation logic and the `Backend` interface that database-specific packages implement.

## Backend Interface

Implement the `Backend` interface to add support for a new evaluation
target. Two shapes are supported: SQL-translating backends and
non-SQL evaluators that compute results directly in memory.

```ts
import type { Backend } from "datamog-engine";

// SQL-translating backend (Postgres, SQLite, sql.js).
const sqlBackend: Backend = {
  sqlDialect: new MyDialect(), // implements SqlDialect
  async execute(query, params?) { /* run SQL, return rows */ },
  async close() { /* clean up */ },
};

// Non-SQL backend (e.g. native / seminaive). Set `sqlDialect: null`
// and implement `evaluateProgram` (replaces the translate→SQL path)
// and optionally `insertRows` (replaces SQL INSERTs from loaders).
const nativeBackend: Backend = {
  sqlDialect: null,
  async execute() { throw new Error("no SQL — use evaluateProgram"); },
  async evaluateProgram(analyzed, loaders) { /* run rules in-memory */ },
  async insertRows(decl, rows) { /* append EDB tuples */ },
  async close() { /* clean up */ },
};
```

Built-in backend packages: `datamog-backend-postgres`,
`datamog-backend-sqlite`, `datamog-backend-sqljs`,
`datamog-backend-native`, and `datamog-backend-seminaive`.

## Translation

```ts
import { parse } from "datamog-parser";
import { analyze, inferTypes } from "datamog-core";
import { translate } from "datamog-engine";
import { PostgresSqlDialect } from "datamog-backend-postgres";

const program = parse(source);
const analyzed = inferTypes(analyze(program));
const result = translate(analyzed, new PostgresSqlDialect());

result.createTables; // CREATE TABLE statements for extensional predicates
result.createViews;  // CREATE [RECURSIVE] VIEW statements for intensional predicates
result.queries;      // SELECT statements for queries
```

## Executor

`DatamogExecutor` orchestrates the full pipeline (create tables, load data, create views, run queries):

```ts
import { DatamogExecutor } from "datamog-engine";
import { create as createBackend } from "datamog-backend-sqlite";

const backend = await createBackend();
const executor = new DatamogExecutor(backend, [loader1, loader2]);
const results = await executor.execute(source);
await backend.close();
```

## Extensional Loader Interface

Implement `ExtensionalLoader` to add custom data sources:

```ts
import type { ExtensionalLoader, Backend } from "datamog-engine";

const myLoader: ExtensionalLoader = {
  name: "my-loader",
  async canLoad(decl) { /* return true if you can handle this predicate */ },
  async load(decl, backend) { /* INSERT rows via backend.execute() */ },
};
```
