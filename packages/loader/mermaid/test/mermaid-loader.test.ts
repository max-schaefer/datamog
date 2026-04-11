import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import { MermaidLoader } from "../src/mermaid-loader.ts";

function makeDecl(predicate: string, columns: { name: string; type: "text" }[]): ExtDecl {
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
      { name: "from", type: "text" },
      { name: "to", type: "text" },
    ]);
    expect(await loader.canLoad(decl)).toBe(true);
  });

  test("canLoad returns false when .mmd file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("missing", [
      { name: "from", type: "text" },
      { name: "to", type: "text" },
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
      { name: "name", type: "text" },
      { name: "child", type: "text" },
    ]);
    const rows = await loader.readRows(decl);
    expect(rows).toEqual([
      { name: "alice", child: "bob" },
      { name: "bob", child: "carol" },
      { name: "bob", child: "dave" },
    ]);
  });

  test("readRows throws for non-binary predicate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-test-"));
    await writeFile(join(dir, "triple.mmd"), "graph TD\n    A --> B\n");
    const loader = new MermaidLoader({ directory: dir });
    const decl = makeDecl("triple", [
      { name: "a", type: "text" },
      { name: "b", type: "text" },
      { name: "c", type: "text" },
    ]);
    expect(loader.readRows(decl)).rejects.toThrow("binary predicate");
  });
});
