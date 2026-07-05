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
    expect(parseMermaidGraph(input)).toEqual([{ source: "A", target: "B", label: "likes" }]);
  });

  test("handles chained edges with -- label --> form", () => {
    // Regression: with chained labelled edges, the second edge's lhs
    // looked like `-- t2` (no source before the dashes — the previous
    // arrow had already consumed the source). The labelled-arrow regex
    // requires a source *before* the dashes, so it didn't fire and the
    // raw `-- t2` became the literal source id, producing
    // `{ source: "-- t2", target: "C" }` instead of
    // `{ source: "B", target: "C", label: "t2" }`. The `|label|`
    // pipe form already worked because the label is consumed from
    // the rhs.
    const input = `graph TD
    A -- t1 --> B -- t2 --> C`;
    expect(parseMermaidGraph(input)).toEqual([
      { source: "A", target: "B", label: "t1" },
      { source: "B", target: "C", label: "t2" },
    ]);
  });

  test("handles chained edges with == label ==> form", () => {
    // Same regression in the thick-arrow flavour.
    const input = `graph TD
    A == t1 ==> B == t2 ==> C`;
    expect(parseMermaidGraph(input)).toEqual([
      { source: "A", target: "B", label: "t1" },
      { source: "B", target: "C", label: "t2" },
    ]);
  });

  test("Regression: chained edges keep bracketed target labels with spaces intact", () => {
    // The target splitter stopped at the first whitespace, even when that
    // whitespace was inside a Mermaid node label. `B[Bob Smith]` became the
    // target token `B[Bob`, leaving `Smith] --> C` to parse as a second edge
    // from `Smith]` to `C`.
    const input = `graph TD
    A --> B[Bob Smith] --> C("Carol Jones") --> D`;
    expect(parseMermaidGraph(input)).toEqual([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
    ]);
  });

  test("Regression: semicolon statement separators are not part of target ids", () => {
    const input = `graph TD
    A --> B; C --> D;`;
    expect(parseMermaidGraph(input)).toEqual([
      { source: "A", target: "B" },
      { source: "C", target: "D" },
    ]);
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

  test("Regression: a `&` fan-out edge is rejected, not turned into a corrupt node id", () => {
    // Mermaid's `&` fan-out (`A & B --> C`) is outside this loader's
    // supported subset. The parser used to feed the whole token to
    // `extractNodeId`, which (finding no brackets) returned the literal
    // `"A & B"` — a node id with spaces and an ampersand that silently
    // fails to join with anything, the very corruption the orphan-bracket
    // guard avoids. Reject the edge instead (consistent with how malformed
    // nodes are dropped) rather than emit the corrupt id.
    expect(parseMermaidGraph("graph TD\nA & B --> C")).toEqual([]);
    expect(parseMermaidGraph("graph TD\nA & B --> C & D")).toEqual([]);
    expect(parseMermaidGraph("graph TD\nA[x] & B[y] --> C")).toEqual([]);
    expect(parseMermaidGraph("graph TD\nA --> B & C")).toEqual([]);
  });

  test("an ampersand inside a label is preserved (not treated as fan-out)", () => {
    // The `&` rejection must only fire for a top-level fan-out operator,
    // not for an ampersand that legitimately appears inside an edge label.
    expect(parseMermaidGraph("graph TD\nA -->|a & b| C")).toEqual([
      { source: "A", target: "C", label: "a & b" },
    ]);
    expect(parseMermaidGraph("graph TD\nA[x & y] --> C")).toEqual([{ source: "A", target: "C" }]);
  });
});
