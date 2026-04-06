# datamog-backend-postgres

Postgres backend for Datamog, using `Bun.sql`.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { createPostgresBackend } from "datamog-backend-postgres";

const backend = createPostgresBackend();
const executor = new DatamogExecutor(backend);
const results = await executor.execute(source);
await backend.close();
```

Requires the `DATABASE_URL` environment variable to be set (Bun.sql reads it automatically).
