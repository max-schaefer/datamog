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
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when predicate is not mapped", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: {},
    });
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
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
    const decl = getExtDecl("input predicate parent(name: string, child: string).");

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
    const decl = getExtDecl("input predicate t(a: string, b: integer, c: float, d: boolean).");

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

  test("load ignores extra sheet columns", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("input predicate parent(name: string, child: string).");

    mockDocWithSheet(
      loader,
      "Sheet1",
      ["extra", "child", "name"],
      [{ extra: "ignored", child: "bob", name: "alice" }],
    );

    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
  });

  test("Regression: authenticated row coercion errors report the sheet data line", async () => {
    // Authenticated sheet rows come after the header row. The public CSV
    // path reports the first data record as line 2; the authenticated
    // path used i + 1 and pointed at the header line instead.
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { t: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("input predicate t(n: integer).");
    mockDocWithSheet(loader, "Sheet1", ["n"], [{ n: "not-an-int" }]);
    const { backend } = makeMockBackend();

    expect(loader.load(decl, backend)).rejects.toThrow(/t\.gsheet line 2, column 'n'/);
  });

  test("load throws on missing column in header", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123" } },
    });
    const decl = getExtDecl("input predicate parent(name: string, child: string).");

    mockDocWithSheet(loader, "Sheet1", ["name"], []);

    const { backend } = makeMockBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/missing field 'child'/);
  });

  test("load throws on missing sheet", async () => {
    const loader = new GSheetLoader({
      auth: makeAuth(),
      sheets: { parent: { spreadsheetId: "abc123", range: "Missing" } },
    });
    const decl = getExtDecl("input predicate parent(name: string, child: string).");

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
    const decl = getExtDecl("input predicate parent(name: string, child: string).");

    mockDocWithSheet(loader, "Data", ["name", "child"], [{ name: "alice", child: "bob" }]);

    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
  });
});

describe("GSheetLoader (public CSV fallback)", () => {
  function makeLoaderWithCsv(
    sheets: Record<string, { spreadsheetId: string }>,
    csvContent: string,
  ) {
    const loader = new GSheetLoader({ sheets });
    loader.fetchPublicCsv = mock(async () => csvContent);
    return loader;
  }

  test("loads rows from public CSV export when no auth is provided", async () => {
    const loader = makeLoaderWithCsv(
      { parent: { spreadsheetId: "abc123" } },
      "name,child\nalice,bob\ncarol,dave\n",
    );
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(2);
    expect(insertedQueries).toHaveLength(2);
    expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
    expect(insertedQueries[1]?.params).toEqual(["carol", "dave"]);
  });

  test("coerces types from public CSV export", async () => {
    const loader = makeLoaderWithCsv(
      { t: { spreadsheetId: "abc123" } },
      "a,b,c,d\nhello,42,3.14,true\n",
    );
    const decl = getExtDecl("input predicate t(a: string, b: integer, c: float, d: boolean).");
    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries[0]?.params).toEqual(["hello", 42, 3.14, true]);
  });

  test("Regression: strips a UTF-8 BOM from the public CSV export", async () => {
    // Google Sheets' CSV export sometimes prefixes the response with
    // a UTF-8 BOM. Without `bom: true`, csv-parse treats the BOM as
    // part of the first column header, so a sheet whose first column
    // is `name` arrives keyed as `﻿name` and the declared
    // `name` column lookup fails with `missing field 'name'`. The
    // file-on-disk csv loader (`parseCsvContent`) has carried
    // `bom: true` since the start; the gsheet path should match.
    const loader = makeLoaderWithCsv(
      { parent: { spreadsheetId: "abc123" } },
      "﻿name,child\nalice,bob\n",
    );
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);
    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries[0]?.params).toEqual(["alice", "bob"]);
  });

  test("Regression: public CSV row errors report the source line after blank rows", async () => {
    // The public CSV path used the shared keyed-row builder's default
    // record-index-to-line mapping (`i + 2`). With `skip_empty_lines`,
    // a blank row after the header shifts later diagnostics upward, so a
    // bad value on source line 4 was reported as line 3.
    const loader = makeLoaderWithCsv({ t: { spreadsheetId: "abc123" } }, "n\n\n1\nnot-an-int\n");
    const decl = getExtDecl("input predicate t(n: integer).");
    const { backend } = makeMockBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/t\.gsheet line 4, column 'n'/);
  });

  test("throws on missing column in public CSV export", async () => {
    const loader = makeLoaderWithCsv({ parent: { spreadsheetId: "abc123" } }, "name\nalice\n");
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
    const { backend } = makeMockBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/missing field 'child'/);
  });

  test("returns zero rows for empty CSV", async () => {
    const loader = makeLoaderWithCsv({ parent: { spreadsheetId: "abc123" } }, "");
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
    const { backend } = makeMockBackend();
    const result = await loader.load(decl, backend);
    expect(result.rowsLoaded).toBe(0);
  });

  test("handles quoted fields in public CSV export", async () => {
    const loader = makeLoaderWithCsv(
      { parent: { spreadsheetId: "abc123" } },
      'name,child\n"alice, sr",bob\n"carol ""C""",dave\n',
    );
    const decl = getExtDecl("input predicate parent(name: string, child: string).");
    const { backend, insertedQueries } = makeMockBackend();
    const result = await loader.load(decl, backend);

    expect(result.rowsLoaded).toBe(2);
    expect(insertedQueries[0]?.params).toEqual(["alice, sr", "bob"]);
    expect(insertedQueries[1]?.params).toEqual(['carol "C"', "dave"]);
  });
});
