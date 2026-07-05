# datamog-backend-native

Native in-memory backend for Datamog. Interprets Datalog directly with a
naive bottom-up evaluator — no SQL is generated. Intended for teaching
the semantics: strata are computed in topological order and each stratum
is re-run until its fixed point is reached.

Cross-backend invariants (divide-by-zero / domain-error NULLs, slice
bounds, integer-vs-float division) match the SQL backends.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { create } from "datamog-backend-native";

const backend = create();
const executor = new DatamogExecutor(backend);
const results = await executor.execute(source);
await backend.close();
```

`--dry-run` is not available for this backend since there's no SQL to
preview.
