import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import { MermaidLoader } from "../src/mermaid-loader.ts";

function makeDecl(predicate: string, columns: { name: string; type: "string" }[]): ExtDecl {
  return {
    kind: "ext_decl",
    predicate,
    columns,
    span: { start: 0, end: 0, line: 1, column: 1 },
  };
}

describe("MermaidLoader", () => {
  test("canLoad returns true when .mmd file exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    await writeFile(join(dir, "edge.mmd"), "graph TD\n    A --> B\n");
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("edge", [
      { name: "from", type: "string" },
      { name: "to", type: "string" },
    ]);
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when .mmd file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("missing", [
      { name: "from", type: "string" },
      { name: "to", type: "string" },
    ]);
    expect(await loader.canLoad(decl)).toBe(false);
  });

  test("readRows extracts edges into column-named rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    await writeFile(
      join(dir, "parent.mmd"),
      "graph TD\n    alice --> bob\n    bob --> carol\n    bob --> dave\n",
    );
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("parent", [
      { name: "name", type: "string" },
      { name: "child", type: "string" },
    ]);
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([
      { name: "alice", child: "bob" },
      { name: "bob", child: "carol" },
      { name: "bob", child: "dave" },
    ]);
  });

  test("readRows extracts edge labels into third column", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    await writeFile(join(dir, "road.mmd"), "graph TD\n    A -->|5| B\n    B --> C\n");
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("road", [
      { name: "from", type: "string" },
      { name: "to", type: "string" },
      { name: "label", type: "string" },
    ]);
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([
      { from: "A", to: "B", label: "5" },
      { from: "B", to: "C", label: "" },
    ]);
  });

  test("parse error names the source file", async () => {
    // Regression: `parseMermaidGraph` raised a context-free
    // `Expected a Mermaid graph or flowchart diagram` error when the
    // header line wasn't recognised. The wrapping
    // `createDirectoryLoader` didn't add a source prefix, so the user
    // couldn't locate the offending file from the error alone. The
    // sibling JSON / JSONL loaders both prefix parse errors with
    // `<predicate>.<ext>: …`; mirror that wording here.
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    await writeFile(join(dir, "broken.mmd"), "not a graph\nA --> B\n");
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("broken", [
      { name: "a", type: "string" },
      { name: "b", type: "string" },
    ]);
    expect(loader.readRows(decl)).rejects.toThrow(/^broken\.mmd: .*Mermaid/);
  });

  test("readRows throws for predicate with wrong arity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    await writeFile(join(dir, "quad.mmd"), "graph TD\n    A --> B\n");
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("quad", [
      { name: "a", type: "string" },
      { name: "b", type: "string" },
      { name: "c", type: "string" },
      { name: "d", type: "string" },
    ]);
    expect(loader.readRows(decl)).rejects.toThrow("2 or 3 columns");
  });
});
