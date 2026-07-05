import type { ExtDecl } from "datamog-core";
import { type Backend, type ExtensionalLoader, type LoadResult, insertRows } from "datamog-engine";
import { type DirectoryLoader, createDirectoryLoader } from "datamog-engine/directory-loader";
import { parseJsonContent } from "./parse-content.ts";

export { type ParseJsonOptions, parseJsonContent } from "./parse-content.ts";

export interface JsonLoaderOptions {
  directory: string;
}

/**
 * Whole-file JSON loader. The file `<predicate>.json` is parsed as a
 * single JSON value and inserted as exactly one row into the
 * predicate's table. Only applies when the extensional declaration
 * has a single value-typed column — anything else is left for another
 * loader to handle (CSV, JSONL, etc.). The natural use is "load this
 * configuration blob and let rules destructure it".
 */
export class JsonLoader implements ExtensionalLoader {
  readonly name = "value";
  private readonly inner: DirectoryLoader;

  constructor(options: JsonLoaderOptions) {
    this.inner = createDirectoryLoader({
      name: "value",
      extension: ".json",
      directory: options.directory,
      parse: (content, decl) => parseJsonContent(content, decl),
    });
  }

  canLoad(decl: ExtDecl): Promise<boolean> {
    return this.inner.canLoad(decl);
  }

  load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    return this.inner.load(decl, backend);
  }

  /** Read and parse the JSON file into a single typed row. Exposed for testing. */
  readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    return this.inner.readRows(decl);
  }
}

export interface UrlJsonLoaderOptions {
  /**
   * Per-predicate source URL. The loader is willing to handle a
   * declaration only if its predicate has a non-empty URL configured
   * here.
   */
  urls: Record<string, string>;
}

/**
 * HTTP-backed counterpart to {@link JsonLoader}. Fetches each
 * configured URL with the platform's global `fetch` (Bun, modern
 * browsers, and Node 18+ all expose one) and feeds the response body
 * through {@link parseJsonContent}, so behaviour and error shape match
 * the directory-backed loader bit-for-bit.
 */
export class UrlJsonLoader implements ExtensionalLoader {
  readonly name = "url-json";
  private readonly urls: Record<string, string>;

  constructor(options: UrlJsonLoaderOptions) {
    this.urls = options.urls;
  }

  async canLoad(decl: ExtDecl): Promise<boolean> {
    const url = this.urls[decl.predicate];
    return typeof url === "string" && url.trim() !== "";
  }

  async load(decl: ExtDecl, backend: Backend): Promise<LoadResult> {
    const rows = await this.readRows(decl);
    await insertRows(backend, decl, rows);
    return { rowsLoaded: rows.length };
  }

  /** Fetch and parse the configured URL into typed rows. Exposed for testing. */
  async readRows(decl: ExtDecl): Promise<Record<string, unknown>[]> {
    const raw = this.urls[decl.predicate];
    if (raw === undefined || raw.trim() === "") {
      throw new Error(`No URL configured for predicate '${decl.predicate}'`);
    }
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`URL for '${decl.predicate}' must use HTTP or HTTPS`);
    }
    const response = await fetch(url.href);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch JSON for '${decl.predicate}': ${response.status} ${response.statusText}`,
      );
    }
    const content = await response.text();
    return parseJsonContent(content, decl, { source: url.href });
  }
}
