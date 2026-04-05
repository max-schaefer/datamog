import { join } from "node:path";
import type { ExtDecl, SqlType } from "datamog-core";
import type { BunSQL, ExtensionalLoader, LoadResult } from "datamog-postgres";

export interface CsvLoaderOptions {
  directory: string;
  hasHeader?: boolean;
  delimiter?: string;
}

export class CsvLoader implements ExtensionalLoader {
  readonly name = "csv";
  private directory: string;
  private hasHeader: boolean;
  private delimiter: string;

  constructor(options: CsvLoaderOptions) {
    this.directory = options.directory;
    this.hasHeader = options.hasHeader ?? true;
    this.delimiter = options.delimiter ?? ",";
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return Bun.file(this.filePath(decl)).exists();
  }

  async load(decl: ExtDecl, sql: BunSQL): Promise<LoadResult> {
    const rows = await this.readRows(decl);

    for (const row of rows) {
      const columns = decl.columns.map((c) => `"${c.name}"`).join(", ");
      const placeholders = decl.columns.map((_, i) => `$${i + 1}`).join(", ");
      const values = decl.columns.map((c) => row[c.name]);
      await sql.unsafe(
        `INSERT INTO "${decl.predicate}" (${columns}) VALUES (${placeholders})`,
        values,
      );
    }

    return { rowsLoaded: rows.length };
  }

  /** Read and parse the CSV file into typed rows. Exposed for testing. */
  async readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    const content = await Bun.file(this.filePath(decl)).text();
    return this.parseCsv(content, decl);
  }

  private filePath(decl: ExtDecl): string {
    return join(this.directory, `${decl.predicate}.csv`);
  }

  private parseCsv(content: string, decl: ExtDecl): Record<string, unknown>[] {
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    const dataLines = this.hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const fields = this.parseFields(line);
      const row: Record<string, unknown> = {};
      for (let i = 0; i < decl.columns.length; i++) {
        const col = decl.columns[i]!;
        const raw = fields[i] ?? "";
        row[col.name] = coerce(raw, col.type);
      }
      return row;
    });
  }

  private parseFields(line: string): string[] {
    const fields: string[] = [];
    let i = 0;

    while (i <= line.length) {
      if (i === line.length) {
        break;
      }

      if (line[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let value = "";
        while (i < line.length) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            value += line[i];
            i++;
          }
        }
        fields.push(value);
        // Skip delimiter
        if (i < line.length && line[i] === this.delimiter) {
          i++;
        }
      } else {
        // Unquoted field
        const nextDelim = line.indexOf(this.delimiter, i);
        if (nextDelim === -1) {
          fields.push(line.slice(i));
          break;
        }
        fields.push(line.slice(i, nextDelim));
        i = nextDelim + 1;
      }
    }

    return fields;
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
