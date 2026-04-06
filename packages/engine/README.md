# datamog-engine

SQL translator and executor for the Datamog Datalog system. This package provides the shared translation logic and the `Backend` interface that database-specific packages implement.

## Backend Interface

Implement the `Backend` interface to add support for a new database:

```ts
import type { Backend } from "datamog-engine";

const myBackend: Backend = {
  dialect: "postgres", // or "sqlite"
  async execute(query, params?) { /* run SQL, return rows */ },
  async close() { /* clean up */ },
};
```

Built-in backend packages: `datamog-backend-postgres` and `datamog-backend-sqlite`.

## Translation

```ts
import { parse } from "datamog-parser";
import { analyze } from "datamog-core";
import { translate } from "datamog-engine";

const program = parse(source);
const analyzed = analyze(program);
const result = translate(analyzed, { dialect: "postgres" });

result.createTables; // CREATE TABLE statements for extensional predicates
result.createViews;  // CREATE [RECURSIVE] VIEW statements for intensional predicates
result.queries;      // SELECT statements for queries
```

## Executor

`DatamogExecutor` orchestrates the full pipeline (create tables, load data, create views, run queries):

```ts
import { DatamogExecutor } from "datamog-engine";
import { create as createBackend } from "datamog-backend-sqlite";

const backend = createBackend();
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
