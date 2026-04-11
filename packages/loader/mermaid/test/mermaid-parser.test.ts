import { describe, expect, test } from "bun:test";
import { parseMermaidGraph } from "../src/mermaid-parser.ts";

describe("parseMermaidGraph", () => {
  test("parses graph TD with --> arrows", () => {
    const input = `graph TD
    alice --> bob
    bob --> carol`;
    expect(parseMermaidGraph(input)).toEqual([
      { source: "alice", target: "bob" },
      { source: "bob", target: "carol" },
    ]);
  });

  test("parses flowchart LR", () => {
    const input = `flowchart LR
    A --> B
    B --> C`;
    expect(parseMermaidGraph(input)).toEqual([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
  });

  test("strips node labels in brackets", () => {
    const input = `graph TD
    A["Alice"] --> B["Bob"]`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("strips node labels in parentheses", () => {
    const input = `graph TD
    A(Alice) --> B(Bob)`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("handles edge labels with |label| syntax", () => {
    const input = `graph TD
    A -->|likes| B`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("handles thick arrows (==>)", () => {
    const input = `graph TD
    A ==> B`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("handles dotted arrows (-.->)", () => {
    const input = `graph TD
    A -.-> B`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("skips comments", () => {
    const input = `graph TD
    %% this is a comment
    A --> B`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("skips subgraph/end/style directives", () => {
    const input = `graph TD
    subgraph cluster1
    A --> B
    end
    style A fill:#f9f`;
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B" }]);
  });

  test("returns empty array for graph with no edges", () => {
    const input = "graph TD";
    expect(parseMermaidGraph(input)).toEqual([]);
  });

  test("throws on non-graph diagram", () => {
    expect(() => parseMermaidGraph("sequenceDiagram")).toThrow(
      "Expected a Mermaid graph or flowchart diagram",
    );
  });

  test("throws on empty input", () => {
    expect(() => parseMermaidGraph("")).toThrow("Expected a Mermaid graph or flowchart diagram");
  });
});
