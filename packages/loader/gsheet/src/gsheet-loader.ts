import { parse as parseCsv } from "csv-parse/sync";
import type { ExtDecl } from "datamog-core";
import { csvRowsFromKeyed } from "datamog-csv/parse-content";
import {
  type Backend,
  type ExtensionalLoader,
  type LoadResult,
  coerceColumnValue,
  insertRows,
} from "datamog-engine";
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

    // Verify all declared columns exist in the sheet headers. Error
    // messages mirror the CSV/JSONL loaders' "<source> ...: missing
    // field '<name>'" shape so users see one consistent format whether
    // their data came from a file or a sheet.
    const source = `${decl.predicate}.gsheet`;
    for (const col of decl.columns) {
      if (!headers.includes(col.name)) {
        throw new Error(`${source}: missing field '${col.name}'`);
      }
    }

    const sheetRows = await sheet.getRows();

    const rows = sheetRows.map((row, i) => {
      const lineNum = i + 2;
      const out: Record<string, unknown> = {};
      for (const col of decl.columns) {
        const raw = row.get(col.name) ?? "";
        out[col.name] = coerceColumnValue(
          String(raw),
          col,
          `${source} line ${lineNum}, column '${col.name}'`,
        );
      }
      return out;
    });
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }

  /** Fetch a public spreadsheet as CSV and load it. No auth required. */
  private async loadPublicCsv(
    config: SheetConfig,
    decl: ExtDecl,
    backend: Backend,
  ): Promise<LoadResult> {
    const csvText = await this.fetchPublicCsv(config.spreadsheetId, decl.predicate);
    const parsed = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      // Google Sheets' CSV export sometimes prefixes the response
      // with a UTF-8 BOM. Without `bom: true`, csv-parse keys the
      // first column as `﻿<name>` and the declared column lookup
      // fails with `missing field 'name'`. The file-on-disk csv
      // loader has carried `bom: true` since the start; mirror
      // that here.
      bom: true,
      info: true,
    }) as unknown as { record: Record<string, string>; info: { lines: number } }[];
    const rows = csvRowsFromKeyed(
      parsed.map(({ record }) => record),
      decl,
      {
        source: `${decl.predicate}.gsheet`,
        lineNumOf: (i) => parsed[i]!.info.lines,
      },
    );
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
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
