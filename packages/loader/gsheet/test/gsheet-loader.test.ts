import { describe, expect, mock, test } from "bun:test";
import type { ExtDecl } from "datamog-core";
import { parse } from "datamog-parser";
import { GSheetLoader } from "../src/gsheet-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

describe("GSheetLoader", () => {
  test("canLoad returns true when predicate is mapped", async () => {
    const loader = new GSheetLoader({
      apiKey: "fake-key",
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when predicate is not mapped", async () => {
    const loader = new GSheetLoader({
      apiKey: "fake-key",
      sheets: {},
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(await loader.canLoad(decl)).toBe(false);
  });

  test("parseResponse extracts rows with header mapping", () => {
    const loader = new GSheetLoader({
      apiKey: "fake-key",
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    const apiResponse = {
      values: [
        ["name", "child"],
        ["alice", "bob"],
        ["carol", "dave"],
      ],
    };

    const rows = loader.parseResponse(apiResponse, decl);
    expect(rows).toEqual([
      { name: "alice", child: "bob" },
      { name: "carol", child: "dave" },
    ]);
  });

  test("parseResponse coerces types", () => {
    const loader = new GSheetLoader({
      apiKey: "fake-key",
      sheets: { t: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional t(a: text, b: integer, c: real, d: boolean).");

    const apiResponse = {
      values: [
        ["a", "b", "c", "d"],
        ["hello", "42", "3.14", "true"],
      ],
    };

    const rows = loader.parseResponse(apiResponse, decl);
    expect(rows).toEqual([{ a: "hello", b: 42, c: 3.14, d: true }]);
  });

  test("parseResponse handles empty response", () => {
    const loader = new GSheetLoader({
      apiKey: "fake-key",
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    const rows = loader.parseResponse({ values: [["name", "child"]] }, decl);
    expect(rows).toEqual([]);
  });

  test("parseResponse handles missing values key", () => {
    const loader = new GSheetLoader({
      apiKey: "fake-key",
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    const rows = loader.parseResponse({}, decl);
    expect(rows).toEqual([]);
  });

  test("builds correct API URL", () => {
    const loader = new GSheetLoader({
      apiKey: "my-key",
      sheets: { parent: { spreadsheetId: "abc123", range: "Data!A:Z" } },
    });

    const url = loader.buildUrl("parent");
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/abc123/values/Data!A%3AZ?key=my-key",
    );
  });

  test("builds URL with default range", () => {
    const loader = new GSheetLoader({
      apiKey: "my-key",
      sheets: { parent: { spreadsheetId: "abc123" } },
    });

    const url = loader.buildUrl("parent");
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/abc123/values/Sheet1?key=my-key",
    );
  });

  test("load fetches and inserts rows", async () => {
    const apiResponse = {
      values: [
        ["name", "child"],
        ["alice", "bob"],
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(apiResponse), { status: 200 }),
    ) as typeof fetch;

    try {
      const loader = new GSheetLoader({
        apiKey: "fake-key",
        sheets: { parent: { spreadsheetId: "abc123" } },
      });
      const decl = getExtDecl("extensional parent(name: text, child: text).");

      const insertedQueries: { query: string; params: unknown[] }[] = [];
      const mockBackend = {
        dialect: "sqlite" as const,
        async execute(query: string, params?: unknown[]) {
          insertedQueries.push({ query, params: params ?? [] });
          return [];
        },
        close() {},
      };

      const result = await loader.load(decl, mockBackend);
      expect(result.rowsLoaded).toBe(1);
      expect(insertedQueries).toHaveLength(1);
      expect(insertedQueries[0]?.query).toContain("INSERT INTO");
      expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
