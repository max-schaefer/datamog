import type { ExtDecl } from "datamog-core";
import type { Backend, ExtensionalLoader, LoadResult } from "datamog-engine";
import { type DirectoryLoader, createDirectoryLoader } from "datamog-engine/directory-loader";
import { type ParseJsonlOptions, parseJsonlContent } from "./parse-content.ts";

export type { ParseJsonlOptions };
export { parseJsonlContent };

export interface JsonlLoaderOptions {
  directory: string;
}

export class JsonlLoader implements ExtensionalLoader {
  readonly name = "jsonl";
  private readonly inner: DirectoryLoader;

  constructor(options: JsonlLoaderOptions) {
    this.inner = createDirectoryLoader({
      name: "jsonl",
      extension: ".jsonl",
      directory: options.directory,
      parse: (content, decl) => parseJsonlContent(content, decl),
    });
  }

  canLoad(decl: ExtDecl): Promise<boolean> {
    return this.inner.canLoad(decl);
  }

  load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    return this.inner.load(decl, backend);
  }

  /** Read and parse the JSONL file into typed rows. Exposed for testing. */
  readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    return this.inner.readRows(decl);
  }
}
