import type { ExtDecl } from "datamog-core";
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
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) return { rowsLoaded: 0 };

    const headers = parseFields(lines[0]!);
    const dataLines = lines.slice(1);

    for (const [i, line] of dataLines.entries()) {
      const fields = parseFields(line);
      const values = decl.columns.map((col) => {
        const idx = headers.indexOf(col.name);
        const raw = idx >= 0 ? (fields[idx] ?? "") : "";
        return coerceValue(raw, col.type, `${decl.predicate} row ${i + 1}, column '${col.name}'`);
      });
      const columns = decl.columns.map((c) => `"${c.name}"`).join(", ");
      const placeholders = decl.columns.map((_, j) => `$${j + 1}`).join(", ");
      await backend.execute(
        `INSERT INTO "${decl.predicate}" (${columns}) VALUES (${placeholders})`,
        values as unknown[],
      );
    }

    return { rowsLoaded: dataLines.length };
  }
}

function parseFields(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) break;
    if (line[i] === '"') {
      i++;
      let value = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ",") i++;
    } else {
      const nextComma = line.indexOf(",", i);
      if (nextComma === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, nextComma));
      i = nextComma + 1;
    }
  }
  return fields;
}
