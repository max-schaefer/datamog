import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import type { Backend } from "datamog-engine";
import { parse } from "datamog-parser";
import { DiskLoader } from "../src/disk-loader.ts";

function getExtDecl(source: string): ExtDecl {
  return parse(source).statements[0] as ExtDecl;
}

/** A no-SQL backend that just captures the rows `insertRows` would write. */
function captureBackend(): Backend & { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  return {
    sqlDialect: null,
    rows,
    async insertRows(_decl, r) {
      rows.push(...r);
    },
    async execute() {
      return [];
    },
    close() {},
  } as Backend & { rows: Record<string, unknown>[] };
}

describe("DiskLoader", () => {
  let dir: string;

  test("Regression: a CSV row with more fields than the header is rejected", async () => {
    // The vscode disk loader built each keyed record with a loop capped at
    // `i < record.length && i < header.length`, so a row with MORE fields
    // than the header silently dropped the extras and was accepted —
    // diverging from the canonical Bun `CsvLoader` and the playground
    // loader, which both throw "expected N fields but got M". A malformed
    // sibling `.csv` (a stray trailing comma / extra column) therefore
    // produced silently-wrong data only in the editor.
    dir = await mkdtemp(join(tmpdir(), "datamog-disk-"));
    try {
      await writeFile(join(dir, "t.csv"), "a,b\n1,2,3\n");
      const loader = new DiskLoader(dir);
      const decl = getExtDecl("extensional t(a: integer, b: integer).");
      expect(loader.load(decl, captureBackend())).rejects.toThrow(/expected 2 fields but got 3/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
