# datamog-jsonl

JSONL (JSON Lines) loader plugin for Datamog. Populates extensional predicate tables from `.jsonl` files.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { JsonlLoader } from "datamog-jsonl";

const executor = new DatamogExecutor(backend, [
  new JsonlLoader({ directory: "./data" }),
]);
```

The loader looks for `<predicate>.jsonl` in the configured directory (e.g. `data/follows.jsonl` for an `extensional follows(...)` declaration). Each line is a JSON object with keys matching the declared column names:

```jsonl
{"user":"alice","friend":"bob"}
{"user":"carol","friend":"dave"}
```

String values are coerced to match declared column types. Already-typed JSON values (numbers, booleans) are passed through directly.
