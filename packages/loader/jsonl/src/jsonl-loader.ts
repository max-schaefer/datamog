import { join } from "node:path";
import type { ExtDecl, SqlType } from "datamog-core";
import type { Backend, ExtensionalLoader, LoadResult } from "datamog-engine";

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
      const obj = JSON.parse(line) as Record<string, unknown>;
      const row: Record<string, unknown> = {};
      for (const col of decl.columns) {
        if (!(col.name in obj)) {
          throw new Error(
            `${decl.predicate}.jsonl line ${lineIndex + 1}: missing field '${col.name}'`,
          );
        }
        row[col.name] = coerce(obj[col.name], col.type);
      }
      return row;
    });
  }

  private filePath(decl: ExtDecl): string {
    return join(this.directory, `${decl.predicate}.jsonl`);
  }
}

function coerce(value: unknown, type: SqlType): unknown {
  if (typeof value === "string") {
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
  return value;
}
