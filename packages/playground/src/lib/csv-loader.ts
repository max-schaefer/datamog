import type { ExtDecl } from "datamog-core";
import { parse as parseCsv } from "csv-parse/sync";
import { type Backend, type ExtensionalLoader, type LoadResult, coerceValue } from "datamog-engine";

export class InMemoryCsvLoader implements ExtensionalLoader {
  readonly name = "in-memory-csv";
  private csvData: Map<string, string>;

  constructor(csvData: Map<string, string>) {
    this.csvData = csvData;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return this.csvData.has(decl.predicate);
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const content = this.csvData.get(decl.predicate)!;
    const records: Record<string, string>[] = parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const [i, record] of records.entries()) {
      const values = decl.columns.map((col) => {
        const raw = record[col.name] ?? "";
        return coerceValue(raw, col.type, `${decl.predicate} row ${i + 1}, column '${col.name}'`);
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
}
