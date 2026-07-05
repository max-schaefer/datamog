export interface MermaidEdge {
  source: string;
  target: string;
  label?: string;
}

const DIAGRAM_HEADER = /^\s*(graph|flowchart)\s+(TD|TB|BT|LR|RL)\s*$/i;
const COMMENT = /^\s*%%/;

// Arrow patterns (longer first within each family to avoid partial matches)
const ARROWS = ["---->", "--->", "-->", "=====>", "====>", "===>", "==>", "-.->", "---", "==="];

/** Locate the leftmost arrow occurrence in `s`, preferring longer matches at the same position. */
function findFirstArrow(s: string): { arrow: string; idx: number } | undefined {
  let bestIdx = -1;
  let bestArrow = "";
  for (const arrow of ARROWS) {
    const idx = s.indexOf(arrow);
    if (idx === -1) continue;
    if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && arrow.length > bestArrow.length)) {
      bestIdx = idx;
      bestArrow = arrow;
    }
  }
  return bestIdx === -1 ? undefined : { arrow: bestArrow, idx: bestIdx };
}

/**
 * Extract the node ID from a token like `alice`, `A["Alice"]`, `B(Bob)`, `C{Decision}`, etc.
 */
function extractNodeId(token: string): string {
  const bracketIdx = token.search(/[[\](){}]/);
  // `bracketIdx === 0` means the token starts with a bracket and has no
  // ID prefix (e.g. `[Alice]` or `(Bob)`) — that's malformed Mermaid, but
  // returning the literal `[Alice]` as a node ID corrupts every downstream
  // join. Fall through to "no ID" by returning empty so the caller can
  // skip the edge cleanly.
  if (bracketIdx === 0) return "";
  if (bracketIdx > 0) {
    return token.slice(0, bracketIdx);
  }
  return token;
}

function splitTarget(raw: string): { targetRaw: string; remainder: string } {
  const stack: string[] = [];
  const closes: Record<string, string> = { "[": "]", "(": ")", "{": "}" };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    const expectedClose = stack[stack.length - 1];
    if (expectedClose === ch) {
      stack.pop();
      continue;
    }
    const close = closes[ch];
    if (close !== undefined) {
      stack.push(close);
      continue;
    }
    if (stack.length === 0 && (/\s/.test(ch) || ch === ";")) {
      const rest = raw.slice(i + 1).trimStart();
      return { targetRaw: raw.slice(0, i), remainder: rest };
    }
  }

  return { targetRaw: raw, remainder: "" };
}

/**
 * True if `raw` contains a Mermaid fan-out `&` *outside* node-label
 * brackets. The `&` operator (`A & B --> C`) is outside this loader's
 * supported subset; rather than feed `A & B` to `extractNodeId` and emit
 * a corrupt node id, the caller rejects the edge. An ampersand inside a
 * label (`A[x & y]`) is not a fan-out and must not trigger rejection.
 */
function hasTopLevelAmpersand(raw: string): boolean {
  const stack: string[] = [];
  const closes: Record<string, string> = { "[": "]", "(": ")", "{": "}" };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (stack[stack.length - 1] === ch) {
      stack.pop();
      continue;
    }
    const close = closes[ch];
    if (close !== undefined) {
      stack.push(close);
      continue;
    }
    if (ch === "&" && stack.length === 0) return true;
  }
  return false;
}

/**
 * Parse a Mermaid graph/flowchart definition and extract edges as (source, target) pairs.
 * Only `graph` and `flowchart` diagram types are supported.
 */
export function parseMermaidGraph(content: string): MermaidEdge[] {
  const lines = content.split("\n");
  const edges: MermaidEdge[] = [];

  // Find and validate the diagram header
  const headerLine = lines.find((line) => line.trim() !== "" && !COMMENT.test(line));
  if (!headerLine || !DIAGRAM_HEADER.test(headerLine)) {
    throw new Error(
      "Expected a Mermaid graph or flowchart diagram (e.g., 'graph TD' or 'flowchart LR')",
    );
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || COMMENT.test(trimmed) || DIAGRAM_HEADER.test(trimmed)) {
      continue;
    }
    // Skip directives that aren't edges
    if (/^\s*(subgraph|end|style|classDef|class|click|linkStyle)\b/i.test(trimmed)) {
      continue;
    }

    // Mermaid permits chained edges on a single line (`A --> B --> C`
    // expands to two edges). Walk the line left-to-right, peeling off one
    // edge at a time and continuing with the previous target as the new
    // source until no arrow remains. Without this, the second arrow gets
    // swallowed into the first edge's target string.
    let cursor = trimmed;
    let prevTarget: string | undefined;
    while (cursor) {
      const match = findFirstArrow(cursor);
      if (!match) break;
      const { arrow, idx } = match;

      let lhsRaw = cursor.slice(0, idx).trim();
      let rhsRaw = cursor.slice(idx + arrow.length).trim();
      let label: string | undefined;

      // Mermaid's `A -- text --> B` syntax embeds the edge label between
      // two arrow halves. After `findFirstArrow` matches `-->`, the LHS
      // looks like `A -- text` — split on the trailing ` -- ` (or ` == `
      // for thick arrows) so the source and the label come out separately.
      // Without this, `A -- text` becomes the literal source ID. The pipe
      // form (`A -->|text| B`) is handled below via the rhs branch.
      const labeledMatch = lhsRaw.match(/^(.+?)\s+(--|==)\s+(.+)$/);
      if (labeledMatch) {
        lhsRaw = labeledMatch[1]!;
        label = labeledMatch[3]!;
      } else {
        // Chained labelled-arrow form: `A -- t1 --> B -- t2 --> C`.
        // After the first arrow is consumed, the cursor for the second
        // edge is `-- t2 --> C`, so the LHS is `-- t2` — there's no
        // source *before* the dashes for the regex above to bind to.
        // Recognise the leading-dashes form and treat the rest as the
        // label; the source falls back to `prevTarget` below.
        const chainedLabel = lhsRaw.match(/^(--|==)\s+(.+)$/);
        if (chainedLabel) {
          lhsRaw = "";
          label = chainedLabel[2]!;
        }
      }

      if (rhsRaw.startsWith("|")) {
        const closeIdx = rhsRaw.indexOf("|", 1);
        if (closeIdx !== -1) {
          label = rhsRaw.slice(1, closeIdx).trim();
          rhsRaw = rhsRaw.slice(closeIdx + 1).trim();
        }
      }

      // For a chained arrow the LHS is empty (we already consumed it as the
      // previous target); use that target as the source of this edge.
      const sourceRaw = lhsRaw || prevTarget;
      if (!sourceRaw || !rhsRaw) break;

      // Reject Mermaid `&` fan-out (`A & B --> C`, `A --> B & C`): it's
      // outside the supported subset, and emitting `A & B` as a literal
      // node id would silently corrupt downstream joins. The label has
      // already been stripped from `rhsRaw` above, so an ampersand inside
      // a label doesn't reach here. Drop the line, matching how malformed
      // nodes are skipped rather than turned into bogus ids.
      if (hasTopLevelAmpersand(sourceRaw) || hasTopLevelAmpersand(rhsRaw)) break;

      // Peel off the immediate target: it ends at the next whitespace or
      // semicolon outside node-label brackets, or at end of line.
      const { targetRaw, remainder } = splitTarget(rhsRaw);

      const source = extractNodeId(sourceRaw);
      const target = extractNodeId(targetRaw);
      // Drop edges whose source or target id couldn't be extracted — that
      // happens for malformed Mermaid like `[Alice] --> Bob` (no ID prefix
      // on the bracketed node). Pushing an empty-string id would silently
      // corrupt downstream joins.
      if (source && target) {
        const edge: MermaidEdge = { source, target };
        if (label) edge.label = label;
        edges.push(edge);
      }

      prevTarget = targetRaw;
      cursor = remainder;
    }
  }

  return edges;
}
