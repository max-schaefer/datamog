import type { ExtDecl } from "datamog-core";
import { type Backend, type ExtensionalLoader, type LoadResult, insertRows } from "datamog-engine";
// Pull from the deep `parse-content` entry rather than the package root.
// The root re-exports `JsonlLoader`, which uses `node:path` and `Bun.file`
// at module load — both unavailable in the browser worker, and Vite would
// either fail to resolve or stub them with no-ops.
import { parseJsonlContent } from "datamog-jsonl/parse-content";

export class InMemoryJsonlLoader implements ExtensionalLoader {
  readonly name = "in-memory-jsonl";
  private jsonlData: Map<string, string>;

  constructor(jsonlData: Map<string, string>) {
    this.jsonlData = jsonlData;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    return this.jsonlData.has(decl.predicate);
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const content = this.jsonlData.get(decl.predicate)!;
    let rows: Record<string, unknown>[];
    try {
      rows = parseJsonlContent(content, decl, { source: decl.predicate });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`JSONL parse error for '${decl.predicate}': ${message}`);
    }
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }
}
