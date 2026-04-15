import type { ExtDecl } from "datamog-core";
import { parse as parseCsv } from "csv-parse/sync";
import { type Backend, type ExtensionalLoader, type LoadResult, coerceValue } from "datamog-engine";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

export interface SheetConfig {
  spreadsheetId: string;
  range?: string;
}

export type GSheetAuth = { apiKey: string } | { serviceAccountEmail: string; privateKey: string };

export interface GSheetLoaderOptions {
  auth?: GSheetAuth;
  sheets: Record<string, SheetConfig>;
}

export class GSheetLoader implements ExtensionalLoader {
  readonly name = "gsheet";
  private auth: GSheetAuth | undefined;
  private sheets: Record<string, SheetConfig>;

  constructor(options: GSheetLoaderOptions) {
    this.auth = options.auth;
    this.sheets = options.sheets;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return decl.predicate in this.sheets;
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const config = this.sheets[decl.predicate]!;

    if (!this.auth) {
      return this.loadPublicCsv(config, decl, backend);
    }

    const doc = this.createDoc(config.spreadsheetId);
    await doc.loadInfo();

    const sheetTitle = config.range ?? "Sheet1";
    const sheet = doc.sheetsByTitle[sheetTitle];
    if (!sheet) {
      const available = Object.keys(doc.sheetsByTitle).join(", ");
      throw new Error(
        `Google Sheet for '${decl.predicate}': sheet '${sheetTitle}' not found (available: ${available})`,
      );
    }

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;

    // Verify all declared columns exist in the sheet headers
    for (const col of decl.columns) {
      if (!headers.includes(col.name)) {
        throw new Error(`Google Sheet for '${decl.predicate}': missing column '${col.name}'`);
      }
    }

    const rows = await sheet.getRows();

    for (const row of rows) {
      const values = decl.columns.map((col) => {
        const raw = row.get(col.name) ?? "";
        return coerceValue(
          String(raw),
          col.type,
          `sheet '${decl.predicate}', column '${col.name}'`,
        );
      });
      const columns = decl.columns.map((c) => `"${c.name}"`).join(", ");
      const placeholders = decl.columns.map((_, i) => `$${i + 1}`).join(", ");
      await backend.execute(
        `INSERT INTO "${decl.predicate}" (${columns}) VALUES (${placeholders})`,
        values as unknown[],
      );
    }

    return { rowsLoaded: rows.length };
  }

  /** Fetch a public spreadsheet as CSV and load it. No auth required. */
  private async loadPublicCsv(
    config: SheetConfig,
    decl: ExtDecl,
    backend: Backend,
  ): Promise<LoadResult> {
    const csvText = await this.fetchPublicCsv(config.spreadsheetId, decl.predicate);
    const records: Record<string, string>[] = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const col of decl.columns) {
      if (records.length > 0 && !(col.name in records[0]!)) {
        throw new Error(`Google Sheet for '${decl.predicate}': missing column '${col.name}'`);
      }
    }

    for (const record of records) {
      const values = decl.columns.map((col) => {
        const raw = record[col.name] ?? "";
        return coerceValue(raw, col.type, `sheet '${decl.predicate}', column '${col.name}'`);
      });
      const columns = decl.columns.map((c) => `"${c.name}"`).join(", ");
      const placeholders = decl.columns.map((_, j) => `$${j + 1}`).join(", ");
      await backend.execute(
        `INSERT INTO "${decl.predicate}" (${columns}) VALUES (${placeholders})`,
        values as unknown[],
      );
    }

    return { rowsLoaded: records.length };
  }

  /** Fetch CSV from the public Google Sheets export endpoint. Exposed for testing. */
  async fetchPublicCsv(spreadsheetId: string, predicate: string): Promise<string> {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch public Google Sheet for '${predicate}': ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }

  /** Create a GoogleSpreadsheet instance with the configured auth. Exposed for testing. */
  createDoc(spreadsheetId: string): GoogleSpreadsheet {
    const auth = this.auth!;
    if ("apiKey" in auth) {
      return new GoogleSpreadsheet(spreadsheetId, { apiKey: auth.apiKey });
    }
    const jwt = new JWT({
      email: auth.serviceAccountEmail,
      key: auth.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return new GoogleSpreadsheet(spreadsheetId, jwt);
  }
}
