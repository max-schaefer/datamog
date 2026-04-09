import type { ExtDecl, SqlType } from "datamog-core";
import type { Backend, ExtensionalLoader, LoadResult } from "datamog-engine";

export interface SheetConfig {
  spreadsheetId: string;
  range?: string;
}

export interface GSheetLoaderOptions {
  apiKey: string;
  sheets: Record<string, SheetConfig>;
}

interface SheetsApiResponse {
  values?: string[][];
}

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export class GSheetLoader implements ExtensionalLoader {
  readonly name = "gsheet";
  private apiKey: string;
  private sheets: Record<string, SheetConfig>;

  constructor(options: GSheetLoaderOptions) {
    this.apiKey = options.apiKey;
    this.sheets = options.sheets;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return decl.predicate in this.sheets;
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const url = this.buildUrl(decl.predicate);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Google Sheets API error for '${decl.predicate}': ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as SheetsApiResponse;
    const rows = this.parseResponse(data, decl);

    for (const row of rows) {
      const columns = decl.columns.map((c) => `"${c.name}"`).join(", ");
      const placeholders = decl.columns.map((_, i) => `$${i + 1}`).join(", ");
      const values = decl.columns.map((c) => row[c.name]);
      await backend.execute(
        `INSERT INTO "${decl.predicate}" (${columns}) VALUES (${placeholders})`,
        values as unknown[],
      );
    }

    return { rowsLoaded: rows.length };
  }

  /** Build the Google Sheets API URL for a predicate. Exposed for testing. */
  buildUrl(predicate: string): string {
    const config = this.sheets[predicate]!;
    const range = encodeURIComponent(config.range ?? "Sheet1");
    return `${API_BASE}/${config.spreadsheetId}/values/${range}?key=${this.apiKey}`;
  }

  /** Parse the API response into typed rows. Exposed for testing. */
  parseResponse(data: SheetsApiResponse, decl: ExtDecl): Record<string, unknown>[] {
    const values = data.values;
    if (!values || values.length <= 1) {
      return [];
    }

    const headers = values[0]!;
    const colIndexes = decl.columns.map((col) => headers.indexOf(col.name));
    for (let i = 0; i < decl.columns.length; i++) {
      if (colIndexes[i] === -1) {
        throw new Error(
          `Google Sheet for '${decl.predicate}': missing column '${decl.columns[i]!.name}'`,
        );
      }
    }

    return values.slice(1).map((row) => {
      const result: Record<string, unknown> = {};
      for (let i = 0; i < decl.columns.length; i++) {
        const col = decl.columns[i]!;
        const idx = colIndexes[i]!;
        const raw = idx >= 0 ? (row[idx] ?? "") : "";
        result[col.name] = coerce(raw, col.type);
      }
      return result;
    });
  }
}

function coerce(value: string, type: SqlType): unknown {
  switch (type) {
    case "text":
      return value;
    case "integer":
      return Number.parseInt(value, 10);
    case "real":
      return Number.parseFloat(value);
    case "boolean":
      return ["true", "1", "yes"].includes(value.toLowerCase());
  }
}
