import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "datamog-parser";
import type { ExtDecl } from "datamog-parser";
import { CsvLoader } from "../src/csv-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

describe("CsvLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "datamog-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  test("canLoad returns true when file exists", async () => {
    await Bun.write(join(tempDir, "parent.csv"), "name,child\nalice,bob\n");
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when file does not exist", async () => {
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");
    expect(await loader.canLoad(decl)).toBe(false);
  });

  test("parseCsv parses simple CSV", async () => {
    await Bun.write(join(tempDir, "parent.csv"), "name,child\nalice,bob\ncarol,dave\n");
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([
      { name: "alice", child: "bob" },
      { name: "carol", child: "dave" },
    ]);
  });

  test("parseCsv handles quoted fields with commas", async () => {
    await Bun.write(join(tempDir, "data.csv"), 'a,b\n"hello, world",42\n');
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(data, [a: text, b: integer]).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([{ a: "hello, world", b: 42 }]);
  });

  test("parseCsv handles quoted fields with escaped quotes", async () => {
    await Bun.write(join(tempDir, "data.csv"), 'a\n"say ""hi"""\n');
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(data, [a: text]).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([{ a: 'say "hi"' }]);
  });

  test("coerces types based on ext declaration", async () => {
    await Bun.write(join(tempDir, "t.csv"), "a,b,c,d\nhello,42,3.14,true\n");
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(t, [a: text, b: integer, c: real, d: boolean]).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([{ a: "hello", b: 42, c: 3.14, d: true }]);
  });

  test("boolean coercion accepts various values", async () => {
    await Bun.write(join(tempDir, "t.csv"), "x\ntrue\nfalse\n1\n0\nyes\nno\n");
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(t, [x: boolean]).");
    const rows = await loader.readRows(decl);
    expect(rows.map((r) => r.x)).toEqual([true, false, true, false, true, false]);
  });

  test("CSV without header row", async () => {
    await Bun.write(join(tempDir, "parent.csv"), "alice,bob\ncarol,dave\n");
    const loader = new CsvLoader({ directory: tempDir, hasHeader: false });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([
      { name: "alice", child: "bob" },
      { name: "carol", child: "dave" },
    ]);
  });

  test("custom delimiter", async () => {
    await Bun.write(join(tempDir, "parent.csv"), "name\tchild\nalice\tbob\n");
    const loader = new CsvLoader({ directory: tempDir, delimiter: "\t" });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([{ name: "alice", child: "bob" }]);
  });

  test("skips empty trailing lines", async () => {
    await Bun.write(join(tempDir, "parent.csv"), "name,child\nalice,bob\n\n\n");
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");
    const rows = await loader.readRows(decl);
    expect(rows).toHaveLength(1);
  });

  test("load calls sql with correct inserts", async () => {
    await Bun.write(join(tempDir, "parent.csv"), "name,child\nalice,bob\n");
    const loader = new CsvLoader({ directory: tempDir });
    const decl = getExtDecl(".ext(parent, [name: text, child: text]).");

    const insertedQueries: { query: string; values: unknown[] }[] = [];
    const mockSql = {
      async unsafe(query: string, values?: unknown[]) {
        insertedQueries.push({ query, values: values ?? [] });
        return [];
      },
    };

    const result = await loader.load(decl, mockSql as never);
    expect(result.rowsLoaded).toBe(1);
    expect(insertedQueries).toHaveLength(1);
    expect(insertedQueries[0]?.query).toContain("INSERT INTO");
    expect(insertedQueries[0]?.values).toEqual(["alice", "bob"]);
  });
});
