import { describe, expect, mock, test } from "bun:test";
import type { ExtDecl } from "datamog-core";
import { parse } from "datamog-parser";
import { GSheetLoader } from "../src/gsheet-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

function makeAuth() {
  return { apiKey: "fake-key" };
}

function makeMockBackend() {
  const insertedQueries: { query: string; params: unknown[] }[] = [];
  return {
    insertedQueries,
    backend: {
      dialect: "sqlite" as const,
      async execute(query: string, params?: unknown[]) {
        insertedQueries.push({ query, params: params ?? [] });
        return [];
      },
      close() {},
    },
  };
}

function mockDocWithSheet(
  loader: GSheetLoader,
  sheetTitle: string,
  headers: string[],
  rowData: Record<string, string>[],
) {
  const fakeRows = rowData.map((data) => ({
    get: (col: string) => data[col],
  }));
  const fakeSheet = {
    headerValues: headers,
    loadHeaderRow: mock(async () => {}),
    getRows: mock(async () => fakeRows),
  };
  loader.createDoc = mock(
    () =>
      ({
        loadInfo: mock(async () => {}),
        sheetsByTitle: { [sheetTitle]: fakeSheet },
      }) as unknown as ReturnType<typeof loader.createDoc>,
  );
}

describe("GSheetLoader", () => {
  test("canLoad returns true when predicate is mapped", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when predicate is not mapped", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: {},
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(await loader.canLoad(decl)).toBe(false);
  });

  test("createDoc uses API key auth", () => {
    const loader = new GSheetLoader({
      auth: { apiKey: "my-key" },
      sheets: {},
    });
    expect(loader.createDoc("abc123")).toBeDefined();
  });

  test("createDoc uses service account auth", () => {
    const loader = new GSheetLoader({
      auth: {
        serviceAccountEmail: "test@example.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
      },
      sheets: {},
    });
    expect(loader.createDoc("abc123")).toBeDefined();
  });

  test("load fetches rows and inserts them", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    mockDocWithSheet(
      loader,
      "Sheet1",
      ["name", "child"],
      [
        { name: "alice", child: "bob" },
        { name: "carol", child: "dave" },
      ],
    );

    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(2);
    expect(insertedQueries).toHaveLength(2);
    expect(insertedQueries[0]?.query).toContain("INSERT INTO");
    expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
    expect(insertedQueries[1]?.params).toEqual(["carol", "dave"]);
  });

  test("load coerces types", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { t: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional t(a: text, b: integer, c: real, d: boolean).");

    mockDocWithSheet(
      loader,
      "Sheet1",
      ["a", "b", "c", "d"],
      [{ a: "hello", b: "42", c: "3.14", d: "true" }],
    );

    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries[0]?.params).toEqual(["hello", 42, 3.14, true]);
  });

  test("load throws on missing column in header", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    mockDocWithSheet(loader, "Sheet1", ["name"], []);

    const { backend } = makeMockBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/missing column 'child'/);
  });

  test("load throws on missing sheet", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123", range: "Missing" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    // Mock with only "Sheet1", not "Missing"
    mockDocWithSheet(loader, "Sheet1", ["name", "child"], []);

    const { backend } = makeMockBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/sheet 'Missing' not found/);
  });

  test("load uses custom sheet name from range config", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123", range: "Data" } },
    });
    const decl = getExtDecl("extensional parent(name: text, child: text).");

    mockDocWithSheet(loader, "Data", ["name", "child"], [{ name: "alice", child: "bob" }]);

    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
  });
});
