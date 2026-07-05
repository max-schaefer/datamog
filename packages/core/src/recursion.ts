// Locate body atoms whose predicate sits in the same SCC as their
// rule's head — i.e. the calls the engine evaluates iteratively. The
// playground uses this to render a superscript marker after each
// recursive call so users can see at a glance where the recursion
// runs through.

import type { AnalyzedProgram } from "./analyzer.ts";

export interface RecursiveCall {
  /** Predicate being called recursively. */
  predicate: string;
  /** CST byte offsets of the *body* atom (not the head). */
  offset: number;
  end: number;
}

/**
 * Identify positive body atoms whose predicate is in the same SCC as
 * the rule's head — covers self-recursion (`ancestor` calling
 * `ancestor`) and mutual recursion (`even` calling `odd` when both
 * sit in one stratum).
 *
 * Negated body atoms can't be in the same SCC (stratification rules
 * forbid it), so they're never reached here. Atoms without a CST
 * node are skipped — there's nothing for the editor to underline.
 */
export function findRecursiveCalls(analyzed: AnalyzedProgram): RecursiveCall[] {
  // Resolve `predicate → its-SCC` once. The analyzer's `sortedStrata`
  // is the SCC list (Tarjan output), which we index by member name
  // for O(1) lookups during the per-rule walk.
  const sccOf = new Map<string, Set<string>>();
  for (const stratum of analyzed.sortedStrata) {
    const set = new Set(stratum);
    for (const p of stratum) sccOf.set(p, set);
  }

  const calls: RecursiveCall[] = [];
  for (const [headPredicate, predRules] of analyzed.rules) {
    const scc = sccOf.get(headPredicate);
    if (!scc) continue;
    for (const rule of predRules) {
      for (const elem of rule.body) {
        if (elem.$type !== "Literal" || elem.negated) continue;
        if (!scc.has(elem.predicate)) continue;
        const cst = elem.$cstNode;
        if (!cst) continue;
        calls.push({ predicate: elem.predicate, offset: cst.offset, end: cst.end });
      }
    }
  }
  // Deterministic order so consumers (and tests) can compare arrays.
  calls.sort((a, b) => a.offset - b.offset);
  return calls;
}
