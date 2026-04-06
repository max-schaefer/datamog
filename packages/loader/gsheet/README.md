# datamog-gsheet

Google Sheets loader plugin for Datamog. Populates extensional predicate tables from public Google Sheets using the Sheets API v4.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { GSheetLoader } from "datamog-gsheet";

const loader = new GSheetLoader({
  apiKey: process.env.GOOGLE_API_KEY!,
  sheets: {
    // Map predicate names to spreadsheet IDs
    parent: { spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" },
    edge: { spreadsheetId: "1abc...", range: "Edges!A:B" },
  },
});

const executor = new DatamogExecutor(backend, [loader]);
```

## Configuration

Each predicate is mapped to a spreadsheet via the `sheets` option:

```ts
{
  spreadsheetId: "...",  // Google Sheets spreadsheet ID (required)
  range: "Sheet1",       // Sheet name or A1 range (default: "Sheet1")
}
```

The first row of the sheet is treated as headers and must match the declared column names from the `extensional` declaration.

## Requirements

- A Google API key with the Google Sheets API enabled
- The spreadsheet must be shared as "Anyone with the link can view"
- No external dependencies — uses `fetch` directly against the REST API
