# datamog-csv

CSV loader plugin for Datamog. Populates extensional predicate tables from CSV files.

## Usage

```ts
import { DatamogExecutor } from "datamog-postgres";
import { CsvLoader } from "datamog-csv";

const executor = new DatamogExecutor(Bun.sql, [
  new CsvLoader({ directory: "./data" }),
]);
```

The loader looks for `<predicate>.csv` in the configured directory (e.g. `data/parent.csv` for an `extensional parent(...)` declaration). CSV files are expected to have a header row matching the declared column names.

## Options

```ts
new CsvLoader({
  directory: "./data",   // where to find CSV files (required)
  hasHeader: true,       // whether CSVs have a header row (default: true)
  delimiter: ",",        // field delimiter (default: ",")
});
```

Values are automatically coerced to match the declared column types (`text`, `integer`, `real`, `boolean`).
