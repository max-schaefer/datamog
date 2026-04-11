import type { ExtDecl } from "datamog-core";
import { type Backend, type ExtensionalLoader, type LoadResult, coerceValue } from "datamog-engine";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

export interface SheetConfig {
  spreadsheetId: string;
  range?: string;
}

export type GSheetAuth = { apiKey: string } | { serviceAccountEmail: string; privateKey: string };

export interface GSheetLoaderOptions {
  auth: GSheetAuth;
  sheets: Record<string, SheetConfig>;
}

export class GSheetLoader implements ExtensionalLoader {
  readonly name = "gsheet";
  private auth: GSheetAuth;
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

  /** Create a GoogleSpreadsheet instance with the configured auth. Exposed for testing. */
  createDoc(spreadsheetId: string): GoogleSpreadsheet {
    if ("apiKey" in this.auth) {
      return new GoogleSpreadsheet(spreadsheetId, { apiKey: this.auth.apiKey });
    }
    const jwt = new JWT({
      email: this.auth.serviceAccountEmail,
      key: this.auth.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return new GoogleSpreadsheet(spreadsheetId, jwt);
  }
}
