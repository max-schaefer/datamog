# datamog-backend-sqlite

SQLite backend for Datamog, using `bun:sqlite`. Uses an in-memory database by default.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { createSqliteBackend } from "datamog-backend-sqlite";

// In-memory (default)
const backend = createSqliteBackend();

// Or with a file path
const backend = createSqliteBackend("./my-database.sqlite");

const executor = new DatamogExecutor(backend);
const results = await executor.execute(source);
backend.close();
```
