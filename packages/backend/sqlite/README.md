# datamog-backend-sqlite

SQLite backend for Datamog, using `bun:sqlite`. Uses an in-memory database by default.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { create } from "datamog-backend-sqlite";

// In-memory (default)
const backend = create();

// Or with a file path
const backend = create("./my-database.sqlite");

const executor = new DatamogExecutor(backend);
const results = await executor.execute(source);
backend.close();
```
