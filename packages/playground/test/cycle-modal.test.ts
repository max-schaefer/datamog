import { describe, expect, test } from "bun:test";
import { escapeMermaidLabel } from "../src/lib/mermaid-label.ts";

describe("escapeMermaidLabel", () => {
  test("Regression: line breaks in cycle node labels cannot split Mermaid graph statements", () => {
    // Finiteness cycle labels can include elided source snippets from
    // rule heads. A source string literal may contain a raw newline; if
    // that newline reaches Mermaid's `n["label"]` syntax verbatim, the
    // generated `graph LR` statement is split across two lines.
    expect(escapeMermaidLabel('s(X + "a\nb")')).toBe("s(X + &quot;a b&quot;)");
    expect(escapeMermaidLabel("left\rright")).toBe("left right");
  });
});
