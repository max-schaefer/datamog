import type { ExtDecl } from "datamog-core";
import { type Backend, type ExtensionalLoader, type LoadResult, coerceValue } from "datamog-engine";
import Papa from "papaparse";

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
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      const first = parsed.errors[0]!;
      throw new Error(`CSV parse error for '${decl.predicate}': ${first.message} (row ${first.row})`);
    }

    for (const [i, record] of parsed.data.entries()) {
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

    return { rowsLoaded: parsed.data.length };
  }
}
