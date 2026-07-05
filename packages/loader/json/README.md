# datamog-json

Whole-file JSON loader plugin for Datamog. Populates an extensional predicate with a single row whose value is the parsed contents of a `.json` file.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { JsonLoader } from "datamog-json";

const executor = new DatamogExecutor(backend, [
  new JsonLoader({ directory: "./data" }),
]);
```

The loader looks for `<predicate>.json` in the configured directory (e.g. `data/config.json` for an `extensional config(...)` declaration). The extensional declaration must have **exactly one column, typed `value`** — the file is parsed and inserted as one row whose single column holds the parsed contents:

```prolog
extensional config(blob: value).
```

with `data/config.json`:

```json
{
  "name": "datamog-demo",
  "features": {"tracing": true, "auth": false},
  "endpoints": [{"path": "/health"}, {"path": "/users"}]
}
```

— a single row whose `blob` column holds the whole parsed object. Use the JSON destructuring builtins (`J["key"]`, `object_entry`, `array_element`, `as_*`, `length`, `type_of`) inside rule bodies to project the bits you care about.

For row-per-line shaped data, use `datamog-jsonl` instead. For arbitrary nested JSON inside one of several typed columns, use `datamog-jsonl` with mixed columns.
