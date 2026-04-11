export interface MermaidEdge {
  source: string;
  target: string;
}

const DIAGRAM_HEADER = /^\s*(graph|flowchart)\s+(TD|TB|BT|LR|RL)\s*$/i;
const COMMENT = /^\s*%%/;

// Arrow patterns (longer first to avoid partial matches)
const ARROWS = ["---->", "--->", "-->", "=====>", "====>", "===>", "==>", "-.->", "---", "==="];

/**
 * Extract the node ID from a token like `alice`, `A["Alice"]`, `B(Bob)`, `C{Decision}`, etc.
 */
function extractNodeId(token: string): string {
  const bracketIdx = token.search(/[[\](){}]/);
  if (bracketIdx > 0) {
    return token.slice(0, bracketIdx);
  }
  return token;
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

    // Try each arrow pattern
    for (const arrow of ARROWS) {
      const arrowIdx = trimmed.indexOf(arrow);
      if (arrowIdx === -1) continue;

      const lhs = trimmed.slice(0, arrowIdx).trim();
      let rhs = trimmed.slice(arrowIdx + arrow.length).trim();

      // Handle edge labels: -->|label| target or ==>|label| target
      if (rhs.startsWith("|")) {
        const closeIdx = rhs.indexOf("|", 1);
        if (closeIdx !== -1) {
          rhs = rhs.slice(closeIdx + 1).trim();
        }
      }

      if (lhs && rhs) {
        edges.push({
          source: extractNodeId(lhs),
          target: extractNodeId(rhs),
        });
      }
      break;
    }
  }

  return edges;
}
