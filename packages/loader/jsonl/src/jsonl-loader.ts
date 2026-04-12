import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import { type Backend, type ExtensionalLoader, type LoadResult, checkValue } from "datamog-engine";

export interface JsonlLoaderOptions {
  directory: string;
}

export class JsonlLoader implements ExtensionalLoader {
  readonly name = "jsonl";
  private directory: string;

  constructor(options: JsonlLoaderOptions) {
    this.directory = options.directory;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return Bun.file(this.filePath(decl)).exists();
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const rows = await this.readRows(decl);

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

  /** Read and parse the JSONL file into typed rows. Exposed for testing. */
  async readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    const content = await Bun.file(this.filePath(decl)).text();
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    return lines.map((line, lineIndex) => {
      const parsed: unknown = JSON.parse(line);

      if (Array.isArray(parsed)) {
        return this.readFlatRow(parsed, decl, lineIndex);
      }
      if (typeof parsed === "object" && parsed !== null) {
        return this.readObjectRow(parsed as Record<string, unknown>, decl, lineIndex);
      }
      throw new Error(
        `${decl.predicate}.jsonl line ${lineIndex + 1}: expected object or array, got ${typeof parsed}`,
      );
    });
  }

  private readObjectRow(
    obj: Record<string, unknown>,
    decl: ExtDecl,
    lineIndex: number,
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const col of decl.columns) {
      if (!(col.name in obj)) {
        throw new Error(
          `${decl.predicate}.jsonl line ${lineIndex + 1}: missing field '${col.name}'`,
        );
      }
      row[col.name] = checkValue(
        obj[col.name],
        col.type,
        `${decl.predicate}.jsonl line ${lineIndex + 1}, column '${col.name}'`,
      );
    }
    return row;
  }

  private readFlatRow(arr: unknown[], decl: ExtDecl, lineIndex: number): Record<string, unknown> {
    if (arr.length !== decl.columns.length) {
      throw new Error(
        `${decl.predicate}.jsonl line ${lineIndex + 1}: expected ${decl.columns.length} values but got ${arr.length}`,
      );
    }
    const row: Record<string, unknown> = {};
    for (let i = 0; i < decl.columns.length; i++) {
      const col = decl.columns[i]!;
      row[col.name] = checkValue(
        arr[i],
        col.type,
        `${decl.predicate}.jsonl line ${lineIndex + 1}, column '${col.name}'`,
      );
    }
    return row;
  }

  private filePath(decl: ExtDecl): string {
    return join(this.directory, `${decl.predicate}.jsonl`);
  }
}
