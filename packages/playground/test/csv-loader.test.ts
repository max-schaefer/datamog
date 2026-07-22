import { describe, expect, test } from "bun:test";
import type { ExtDecl } from "datamog-core";
import { parse } from "datamog-parser";
import { InMemoryCsvLoader, UrlCsvLoader } from "../src/lib/csv-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

interface CapturedInsert {
  decl: ExtDecl;
  rows: Record<string, unknown>[];
}

function makeBackend(): { backend: never; inserts: CapturedInsert[] } {
  const inserts: CapturedInsert[] = [];
  const backend = {
    sqlDialect: null,
    async execute(): Promise<Record<string, unknown>[]> {
      return [];
    },
    close(): void {},
    async insertRows(decl: ExtDecl, rows: Record<string, unknown>[]): Promise<void> {
      inserts.push({ decl, rows });
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal stub for testing
  return { backend: backend as any, inserts };
}

describe("InMemoryCsvLoader", () => {
  test("loads rows whose CSV headers match the declared columns", async () => {
    const decl = getExtDecl("input predicate p(name: string, country: string).");
    const csvData = new Map([["p", "name,country\nalice,fr\nbob,jp"]]);
    const loader = new InMemoryCsvLoader(csvData);
    const { backend, inserts } = makeBackend();
    const result = await loader.load(decl, backend);
    expect(result.rowsLoaded).toBe(2);
    expect(inserts[0]?.rows).toEqual([
      { name: "alice", country: "fr" },
      { name: "bob", country: "jp" },
    ]);
  });

  test("Regression: rejects a data row whose cell count is short of the header", async () => {
    // `relax_column_count: true` lets csv-parse accept short rows
    // without raising — keys for the missing trailing cells are
    // simply absent from the per-row record. The wrapper then read
    // each cell with `record[col.name] ?? ""`, which silently
    // coerced the missing string-typed cell into the empty string
    // rather than a clear "missing field" error. Numeric columns
    // failed with `Invalid integer value ''`, which doesn't tell
    // the user the cell was missing — only that the loader saw an
    // empty value. Distinguish `undefined` (missing) from `""`
    // (legitimately empty) and report with the same wording as the
    // header-missing path.
    const decl = getExtDecl("input predicate p(name: string, country: string).");
    const csvData = new Map([["p", "name,country\nalice,fr\nbob"]]);
    const loader = new InMemoryCsvLoader(csvData);
    const { backend } = makeBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/line 3.*missing field 'country'/);
  });

  test("Regression: missing-cell line numbers account for skipped blank lines", async () => {
    // The browser loader used `i + 2` for data-row line numbers. With blank
    // lines after the header, a short row on source line 5 was reported as
    // line 3, sending the user to the wrong row in the playground editor.
    const decl = getExtDecl("input predicate p(name: string, country: string).");
    const csvData = new Map([["p", "name,country\n\n\nalice,fr\nbob"]]);
    const loader = new InMemoryCsvLoader(csvData);
    const { backend } = makeBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/line 5.*missing field 'country'/);
  });

  test("rejects CSV whose header is missing a declared column", async () => {
    // Regression: the playground's in-memory CSV loader uses csv-parse
    // with `columns: true`, which keys each row by header name. When a
    // declared column wasn't present in the user's CSV header, the
    // per-row lookup `record[col.name] ?? ""` silently fell back to the
    // empty string — producing rows that looked legitimate to downstream
    // SQL/native code but had blank values for the missing column. The
    // user never saw a diagnostic.
    //
    // Worse, when the missing column was numeric/boolean the empty
    // string would fail `coerceValue`, surfacing as
    // "Invalid integer value ''" with no hint that the float cause was
    // a header typo. Compare with `JsonlLoader`, which throws a
    // dedicated "missing field" error with the actual column name.
    const decl = getExtDecl("input predicate p(name: string, country: string).");
    const csvData = new Map([["p", "name,city\nalice,paris"]]);
    const loader = new InMemoryCsvLoader(csvData);
    const { backend } = makeBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/missing field 'country'/);
  });

  test("Regression: rejects CSV whose header repeats a declared column", async () => {
    // The file-backed CSV loader rejects duplicate headers before row
    // mapping, but the playground in-memory path parsed with
    // `columns: true`. csv-parse collapses repeated header names there,
    // so `name,country,country` turned `alice,fr,jp` into
    // `{ name: "alice", country: "jp" }` with no signal that one source
    // column was discarded.
    const decl = getExtDecl("input predicate p(name: string, country: string).");
    const csvData = new Map([["p", "name,country,country\nalice,fr,jp"]]);
    const loader = new InMemoryCsvLoader(csvData);
    const { backend } = makeBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/duplicate field 'country'/);
  });
});

describe("UrlCsvLoader", () => {
  test("fetches CSV data from an HTTP URL and loads it through the browser CSV path", async () => {
    const decl = getExtDecl("input predicate p(name: string, country: string).");
    const url = "https://example.test/p.csv";
    const seenUrls: string[] = [];
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      seenUrls.push(String(input));
      return new Response("name,country\nalice,fr\nbob,jp");
    };
    try {
      const loader = new UrlCsvLoader(new Map([["p", url]]));
      const { backend, inserts } = makeBackend();
      const result = await loader.load(decl, backend);

      expect(result.rowsLoaded).toBe(2);
      expect(seenUrls).toEqual([url]);
      expect(inserts[0]?.rows).toEqual([
        { name: "alice", country: "fr" },
        { name: "bob", country: "jp" },
      ]);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  test("rejects non-HTTP URL schemes", async () => {
    const decl = getExtDecl("input predicate p(name: string).");
    const loader = new UrlCsvLoader(new Map([["p", "file:///tmp/p.csv"]]));
    const { backend } = makeBackend();
    expect(loader.load(decl, backend)).rejects.toThrow(/must use HTTP or HTTPS/);
  });
});
