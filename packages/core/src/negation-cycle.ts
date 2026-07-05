// Cycle data structure for non-stratified negation. Mirrors
// `FinitenessCycle` in role: a small, serialisable view of the
// dependency cycle that the editor uses to render a "Show cycle"
// modal and to light up the participating constructs in the source.
//
// Stratification needs negation to be acyclic — a cycle through a
// `not` body atom has no fixed-point semantics. The analyser throws
// an `AnalyzerError` on the first such cycle it finds; we attach a
// `NegationCycle` to that error so the playground can offer the same
// "Show cycle" affordance as the finiteness warning case.

import type { Rule } from "./ast.ts";

export interface NegationCycleNode {
  predicate: string;
  /** Display label (currently just the predicate name). */
  label: string;
  /**
   * Source spans of every occurrence of this predicate's name —
   * head IDENT in each defining rule, plus the IDENT in body atoms
   * (positive or negated) wherever this predicate is referenced.
   * Used by the playground to highlight the in-source positions
   * that participate in the cycle.
   */
  spans: { offset: number; end: number }[];
}

export interface NegationCycleEdge {
  /** Index into `NegationCycle.nodes`. */
  from: number;
  to: number;
  /** True when this dependency is the `not foo` flavour — the offending kind. */
  negative: boolean;
}

export interface NegationCycle {
  nodes: NegationCycleNode[];
  edges: NegationCycleEdge[];
}

// Same regex shape as references.ts uses to skip a leading `not` and
// pick out the predicate IDENT inside a body literal's CST text.
const LITERAL_PRED_RE = /^(?:not\s+)?([a-z][a-zA-Z0-9_]*)/;

function bodyLiteralNameSpan(
  cst: { offset: number; text: string },
  predicate: string,
): { offset: number; end: number } | null {
  const m = LITERAL_PRED_RE.exec(cst.text);
  if (!m || m[1] !== predicate) return null;
  const nameStart = m[0].length - m[1].length;
  return { offset: cst.offset + nameStart, end: cst.offset + nameStart + m[1].length };
}

function collectPredicateNameSpans(
  predicate: string,
  rules: Map<string, Rule[]>,
): { offset: number; end: number }[] {
  const spans: { offset: number; end: number }[] = [];
  for (const [_p, predRules] of rules) {
    for (const rule of predRules) {
      // Head IDENT: the head's CST starts at the predicate name itself,
      // so a length-bounded slice is exactly the IDENT span.
      if (rule.head.predicate === predicate && rule.head.$cstNode) {
        const cst = rule.head.$cstNode;
        spans.push({ offset: cst.offset, end: cst.offset + predicate.length });
      }
      // Body literals (positive or negated): use the regex to skip a
      // leading `not` if present.
      for (const elem of rule.body) {
        if (elem.$type !== "Literal" || elem.predicate !== predicate) continue;
        if (!elem.$cstNode) continue;
        const span = bodyLiteralNameSpan(elem.$cstNode, predicate);
        if (span) spans.push(span);
      }
    }
  }
  spans.sort((a, b) => a.offset - b.offset);
  return spans;
}

/**
 * Build a NegationCycle for the given SCC. Every edge inside the SCC
 * is included so the user can see the whole loop; edges where the
 * source rule's body has a negated atom referencing the destination
 * are flagged `negative` (these are the ones that break stratifi-
 * cation). All other intra-SCC dependencies are positive.
 */
export function buildNegationCycle(
  scc: string[],
  rules: Map<string, Rule[]>,
  dependencies: Map<string, Set<string>>,
  negativeDependencies: Map<string, Set<string>>,
): NegationCycle {
  const sccSet = new Set(scc);
  const nodeIndex = new Map<string, number>();
  const nodes: NegationCycleNode[] = scc.map((p, i) => {
    nodeIndex.set(p, i);
    return { predicate: p, label: p, spans: collectPredicateNameSpans(p, rules) };
  });

  const edgeMap = new Map<string, NegationCycleEdge>();
  const edgeKey = (from: number, to: number) => `${from}->${to}`;
  for (const p of scc) {
    const fromIdx = nodeIndex.get(p)!;
    const posDeps = dependencies.get(p) ?? new Set<string>();
    const negDeps = negativeDependencies.get(p) ?? new Set<string>();
    for (const d of posDeps) {
      if (!sccSet.has(d)) continue;
      const toIdx = nodeIndex.get(d)!;
      const isNegative = negDeps.has(d);
      const key = edgeKey(fromIdx, toIdx);
      const existing = edgeMap.get(key);
      if (!existing) {
        edgeMap.set(key, { from: fromIdx, to: toIdx, negative: isNegative });
      } else if (isNegative && !existing.negative) {
        existing.negative = true;
      }
    }
  }
  return { nodes, edges: [...edgeMap.values()] };
}
