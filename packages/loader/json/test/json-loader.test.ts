import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import { parse } from "datamog-parser";
import { JsonLoader } from "../src/json-loader.ts";

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

describe("JsonLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "datamog-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  test("canLoad matches an existing JSON file", async () => {
    await Bun.write(join(tempDir, "cfg.json"), '{"name":"datamog"}');
    const loader = new JsonLoader({ directory: tempDir });

    expect(await loader.canLoad(getExtDecl("extensional cfg(blob: value)."))).toBe(true);
    expect(await loader.canLoad(getExtDecl("extensional cfg(name: string)."))).toBe(true);
    expect(await loader.canLoad(getExtDecl("extensional missing(blob: value)."))).toBe(false);
  });

  test("loads a whole JSON file as one canonical value row", async () => {
    await Bun.write(join(tempDir, "cfg.json"), '{"b":2,"a":1}');
    const loader = new JsonLoader({ directory: tempDir });
    const decl = getExtDecl("extensional cfg(blob: value).");

    const insertedQueries: { query: string; params: unknown[] }[] = [];
    const mockBackend = {
      sqlDialect: null,
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
    expect(insertedQueries[0]?.params).toEqual(['{"a":1,"b":2}']);
  });

  test("readRows exposes the parsed whole-file JSON row", async () => {
    await Bun.write(join(tempDir, "cfg.json"), '{"b":2,"a":1}');
    const loader = new JsonLoader({ directory: tempDir });
    const decl = getExtDecl("extensional cfg(blob: value).");

    await expect(loader.readRows(decl)).resolves.toEqual([{ blob: { a: 1, b: 2 } }]);
  });

  test("Regression: malformed JSON in the file carries the predicate name", async () => {
    // The bare `JSON.parse(content)` inside the directory loader's
    // `parse` callback used to surface a context-free `SyntaxError:
    // JSON Parse error: …`, leaving the user unable to locate the
    // offending file from the error alone. Wrap with the same
    // `<predicate>.json: …` prefix `checkValue` uses so a sloppy
    // file surfaces actionable context.
    await Bun.write(join(tempDir, "cfg.json"), "{bad json}");
    const loader = new JsonLoader({ directory: tempDir });
    const decl = getExtDecl("extensional cfg(blob: value).");
    const mockBackend = {
      sqlDialect: null,
      async execute() {
        return [];
      },
      close() {},
    };
    expect(loader.load(decl, mockBackend)).rejects.toThrow(/cfg\.json/);
  });

  test("Regression: JSON file with an incompatible declaration fails closed", async () => {
    // Whole-file JSON is only meaningful for a single `value` column.
    // The loader previously treated an existing `cfg.json` as ineligible
    // for `extensional cfg(name: string)`, so the executor skipped it and
    // left `cfg` empty with no diagnostic. Once a matching JSON file
    // exists, reject the declaration shape explicitly.
    await Bun.write(join(tempDir, "cfg.json"), '{"name":"datamog"}');
    const loader = new JsonLoader({ directory: tempDir });
    const decl = getExtDecl("extensional cfg(name: string).");

    expect(await loader.canLoad(decl)).toBe(true);
    expect(loader.readRows(decl)).rejects.toThrow(/exactly one value column/);
  });
});
