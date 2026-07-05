import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ExtDecl } from "datamog-core";
import { parse } from "datamog-parser";
import { UrlJsonLoader } from "../src/json-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

/**
 * Replace the global `fetch` with a handler that maps each requested
 * URL to a fixture body. Returns a restorer; call it from `afterEach`
 * so other tests still hit the real `fetch`.
 */
function mockFetch(byUrl: Map<string, string>): () => void {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    const body = byUrl.get(url);
    if (body === undefined) {
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }
    return new Response(body);
  };
  return () => {
    globalThis.fetch = oldFetch;
  };
}

describe("UrlJsonLoader", () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    restore = () => {};
  });

  afterEach(() => {
    restore();
  });

  test("canLoad is true iff a non-empty URL is configured", async () => {
    const loader = new UrlJsonLoader({
      urls: { configured: "https://example.test/data.json", blank: "  " },
    });

    expect(await loader.canLoad(getExtDecl("extensional configured(blob: value)."))).toBe(true);
    expect(await loader.canLoad(getExtDecl("extensional blank(blob: value)."))).toBe(false);
    expect(await loader.canLoad(getExtDecl("extensional missing(blob: value)."))).toBe(false);
  });

  test("HTTP failure surfaces a useful diagnostic", async () => {
    restore = mockFetch(new Map());
    const loader = new UrlJsonLoader({
      urls: { p: "https://example.test/missing.json" },
    });
    const decl = getExtDecl("extensional p(blob: value).");

    expect(loader.readRows(decl)).rejects.toThrow(/Failed to fetch JSON for 'p': 404/);
  });

  test("non-HTTP URLs are rejected", async () => {
    const loader = new UrlJsonLoader({ urls: { p: "file:///etc/passwd" } });
    const decl = getExtDecl("extensional p(blob: value).");

    expect(loader.readRows(decl)).rejects.toThrow(/must use HTTP or HTTPS/);
  });

  test("malformed remote JSON carries the URL in the error", async () => {
    restore = mockFetch(new Map([["https://example.test/p.json", "{bad json}"]]));
    const loader = new UrlJsonLoader({ urls: { p: "https://example.test/p.json" } });
    const decl = getExtDecl("extensional p(blob: value).");

    expect(loader.readRows(decl)).rejects.toThrow(/example\.test\/p\.json/);
  });

  test("load inserts the row into the backend", async () => {
    restore = mockFetch(new Map([["https://example.test/p.json", JSON.stringify({ a: 1 })]]));
    const loader = new UrlJsonLoader({
      urls: { p: "https://example.test/p.json" },
    });
    const decl = getExtDecl("extensional p(blob: value).");

    const inserted: { query: string; params: unknown[] }[] = [];
    const mockBackend = {
      sqlDialect: null,
      async execute(query: string, params?: unknown[]) {
        inserted.push({ query, params: params ?? [] });
        return [];
      },
      close() {},
    };

    const result = await loader.load(decl, mockBackend);
    expect(result.rowsLoaded).toBe(1);
    expect(inserted).toHaveLength(1);
  });

  test("single-row value semantics", async () => {
    // The declaration must be a single value column, and the whole
    // document becomes one row.
    restore = mockFetch(new Map([["https://example.test/cfg.json", '{"name":"datamog"}']]));
    const loader = new UrlJsonLoader({ urls: { cfg: "https://example.test/cfg.json" } });
    const decl = getExtDecl("extensional cfg(blob: value).");

    await expect(loader.readRows(decl)).resolves.toEqual([{ blob: { name: "datamog" } }]);
  });
});
