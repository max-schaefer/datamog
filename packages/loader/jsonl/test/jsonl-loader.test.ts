import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import { parse } from "datamog-parser";
import { JsonlLoader } from "../src/jsonl-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

describe("JsonlLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "datamog-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  test("canLoad returns true when file exists", async () => {
    await Bun.write(join(tempDir, "parent.jsonl"), '{"name":"alice","child":"bob"}\n');
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when file does not exist", async () => {
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(await loader.canLoad(decl)).toBe(false);
  });

  test("reads rows from JSONL", async () => {
    await Bun.write(
      join(tempDir, "parent.jsonl"),
      '{"name":"alice","child":"bob"}\n{"name":"carol","child":"dave"}\n',
    );
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([
      { name: "alice", child: "bob" },
      { name: "carol", child: "dave" },
    ]);
  });

  test("validates native JSON types", async () => {
    await Bun.write(join(tempDir, "t.jsonl"), '{"a":"hello","b":42,"c":3.14,"d":true}\n');
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional t(a: text, b: integer, c: real, d: boolean).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([{ a: "hello", b: 42, c: 3.14, d: true }]);
  });

  test("skips empty lines", async () => {
    await Bun.write(join(tempDir, "parent.jsonl"), '{"name":"alice","child":"bob"}\n\n\n');
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    const rows = await loader.readRows(decl);
    expect(rows).toHaveLength(1);
  });

  test("rejects rows with missing fields", async () => {
    await Bun.write(join(tempDir, "parent.jsonl"), '{"name":"alice"}\n');
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    expect(loader.readRows(decl)).rejects.toThrow(/missing field 'child'/);
  });

  test("rejects wrong type in JSONL", async () => {
    await Bun.write(join(tempDir, "t.jsonl"), '{"val":"hello"}\n');
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional t(val: integer).");
    expect(loader.readRows(decl)).rejects.toThrow(/Expected integer/);
  });

  test("rejects stringified number in JSONL", async () => {
    await Bun.write(join(tempDir, "t.jsonl"), '{"val":"42"}\n');
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional t(val: integer).");
    expect(loader.readRows(decl)).rejects.toThrow(/Expected integer/);
  });

  test("ignores extra keys in JSON objects", async () => {
    await Bun.write(
      join(tempDir, "parent.jsonl"),
      '{"name":"alice","child":"bob","extra":"ignored","score":99}\n',
    );
    const loader = new JsonlLoader({ directory: tempDir });
    const decl = getExtDecl("extensional parent(name: text, child: text).");
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([{ name: "alice", child: "bob" }]);
  });

  test("load calls backend with correct inserts", async () => {
    await Bun.write(join(tempDir, "parent.jsonl"), '{"name":"alice","child":"bob"}\n');
    const loader = new JsonlLoader({ directory: tempDir });
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
  });
});
