# datamog-backend-sqljs

[sql.js](https://sql.js.org/) (WASM SQLite) backend for Datamog. Runs entirely in-memory with no native dependencies, making it suitable for browser and Node.js environments. Reuses the SQLite SQL dialect from `datamog-backend-sqlite`.

This is the backend used by the Datamog playground.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { create } from "datamog-backend-sqljs";

const backend = await create();
const executor = new DatamogExecutor(backend);
const results = await executor.execute(source);
backend.close();
```
