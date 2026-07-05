import type { ExtDecl } from "datamog-core";
import type { Backend, ExtensionalLoader, LoadResult } from "datamog-engine";
import { type DirectoryLoader, createDirectoryLoader } from "datamog-engine/directory-loader";
import { type MermaidEdge, parseMermaidGraph } from "./mermaid-parser.ts";

export interface MermaidLoaderOptions {
  directory: string;
}

/**
 * Reject non-string column types up front. Mermaid edges expose source/target
 * (always strings) and an optional label (always a string). When the user
 * declares a non-string column type, SQLite silently coerces (or stores the
 * raw string), Postgres raises on `INSERT`, and the native backend stores
 * the mismatched type — none of which are useful. Failing here gives a
 * clear error before any backend touches the data.
 */
export function validateMermaidColumns(decl: ExtDecl): void {
  if (decl.columns.length < 2 || decl.columns.length > 3) {
    throw new Error(
      `Mermaid loader requires 2 or 3 columns, but '${decl.predicate}' has ${decl.columns.length}`,
    );
  }
  for (let i = 0; i < decl.columns.length; i++) {
    const col = decl.columns[i]!;
    if (col.type !== "string") {
      const role = i === 0 ? "source" : i === 1 ? "target" : "label";
      throw new Error(
        `Mermaid loader column ${i + 1} ('${col.name}', ${role}) of '${decl.predicate}' must be string, got ${col.type}`,
      );
    }
  }
}

/**
 * Map parsed Mermaid edges to row objects keyed by the declaration's
 * column names. A 3-column predicate gets the optional edge label as the
 * third value (or `""` when the edge has no label); a 2-column
 * predicate ignores labels entirely. Caller is responsible for
 * validating the column shape via `validateMermaidColumns`.
 */
export function mermaidEdgesToRows(decl: ExtDecl, edges: MermaidEdge[]): Record<string, unknown>[] {
  const [col1, col2] = [decl.columns[0]!.name, decl.columns[1]!.name];
  if (decl.columns.length === 3) {
    const col3 = decl.columns[2]!.name;
    return edges.map((edge) => ({
      [col1]: edge.source,
      [col2]: edge.target,
      [col3]: edge.label ?? "",
    }));
  }
  return edges.map((edge) => ({ [col1]: edge.source, [col2]: edge.target }));
}

export class MermaidLoader implements ExtensionalLoader {
  readonly name = "mermaid";
  private readonly inner: DirectoryLoader;

  constructor(options: MermaidLoaderOptions) {
    this.inner = createDirectoryLoader({
      name: "mermaid",
      extension: ".mmd",
      directory: options.directory,
      validate: validateMermaidColumns,
      parse: (content, decl) => {
        // `parseMermaidGraph` raises a context-free message when the
        // header line isn't a recognised diagram type. The sibling
        // JSON / JSONL loaders both prefix their parse errors with
        // `<predicate>.<ext>: …` so the user can locate the offending
        // file from the error alone — mirror that here.
        try {
          return mermaidEdgesToRows(decl, parseMermaidGraph(content));
        } catch (e) {
          throw new Error(`${decl.predicate}.mmd: ${(e as Error).message}`);
        }
      },
    });
  }

  canLoad(decl: ExtDecl): Promise<boolean> {
    return this.inner.canLoad(decl);
  }

  load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    return this.inner.load(decl, backend);
  }

  /** Read and parse the Mermaid file into rows. Exposed for testing. */
  readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    return this.inner.readRows(decl);
  }
}
