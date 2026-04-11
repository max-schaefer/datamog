import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import type { Backend, ExtensionalLoader, LoadResult } from "datamog-engine";
import { parseMermaidGraph } from "./mermaid-parser.ts";

export interface MermaidLoaderOptions {
  directory: string;
}

export class MermaidLoader implements ExtensionalLoader {
  readonly name = "mermaid";
  private directory: string;

  constructor(options: MermaidLoaderOptions) {
    this.directory = options.directory;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return Bun.file(this.filePath(decl)).exists();
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    if (decl.columns.length !== 2) {
      throw new Error(
        `Mermaid loader requires a binary predicate (2 columns), but '${decl.predicate}' has ${decl.columns.length}`,
      );
    }

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

  /** Read and parse the Mermaid file into rows. Exposed for testing. */
  async readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    if (decl.columns.length !== 2) {
      throw new Error(
        `Mermaid loader requires a binary predicate (2 columns), but '${decl.predicate}' has ${decl.columns.length}`,
      );
    }

    const content = await Bun.file(this.filePath(decl)).text();
    const edges = parseMermaidGraph(content);
    const [col1, col2] = [decl.columns[0]!.name, decl.columns[1]!.name];

    return edges.map((edge) => ({
      [col1]: edge.source,
      [col2]: edge.target,
    }));
  }

  private filePath(decl: ExtDecl): string {
    return join(this.directory, `${decl.predicate}.mmd`);
  }
}
