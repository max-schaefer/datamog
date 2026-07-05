// Locate every textual occurrence of a predicate name that should
// jump to the predicate's definition in the editor. References are
// the predicate IDENT in body literals (positive or negated) and in
// query literals; the definition is the corresponding `extensional`
// declaration's predicate name (for EDBs) or the first rule head
// (for IDBs).
//
// We deliberately *don't* return references for the predicate name
// in a rule head or in the `extensional` declaration itself —
// clicking those should be a no-op (they *are* the definition), and
// emitting them as references would let the user follow a link to
// the spot they already clicked.

import type { AnalyzedProgram } from "./analyzer.ts";
import type { Literal } from "./ast.ts";

export interface PredicateReference {
  /** Predicate name being referenced. */
  predicate: string;
  /** Byte offset of the predicate IDENT (just the name, not the whole literal). */
  offset: number;
  /** Byte end of the predicate IDENT. */
  end: number;
  /** Byte offset of the predicate's definition — where Cmd/Ctrl+click jumps to. */
  definitionOffset: number;
}

// Optional leading prefix (`not` for negated body literals,
// `extensional` for declarations) followed by whitespace and the
// predicate IDENT. Matches at the start of the CST text. The
// capture group is the predicate name; we use
// match[0].length - match[1].length to recover the name's offset
// within the source-text slice.
const LITERAL_PRED_RE = /^(?:not\s+)?([a-z][a-zA-Z0-9_]*)/;
const EXT_DECL_PRED_RE = /^extensional\s+([a-z][a-zA-Z0-9_]*)/;

function spanWithRe(
  cst: { offset: number; text: string },
  re: RegExp,
): { offset: number; end: number } | null {
  const m = re.exec(cst.text);
  if (!m) return null;
  const nameStart = m[0].length - m[1]!.length;
  return {
    offset: cst.offset + nameStart,
    end: cst.offset + nameStart + m[1]!.length,
  };
}

/**
 * Build the `predicate name → definition byte offset` map and emit a
 * reference for every body / query literal occurrence.
 *
 * The order is stable (source-order) so consumers (and tests) can
 * compare arrays without sorting.
 */
export function findPredicateReferences(analyzed: AnalyzedProgram): PredicateReference[] {
  // For an `extensional` declaration the CST starts at the
  // `extensional` keyword, so we have to locate the predicate IDENT
  // *inside* the declaration's text. For a rule head the CST starts
  // at the predicate IDENT itself, so its `offset` is already
  // correct.
  const definitionOffset = new Map<string, number>();
  for (const decl of analyzed.extDecls.values()) {
    const cst = decl.$cstNode;
    if (!cst) continue;
    const span = spanWithRe(cst, EXT_DECL_PRED_RE);
    definitionOffset.set(decl.predicate, span?.offset ?? cst.offset);
  }
  for (const [predicate, rules] of analyzed.rules) {
    const cst = rules[0]?.head.$cstNode;
    if (cst) definitionOffset.set(predicate, cst.offset);
  }

  const refs: PredicateReference[] = [];
  const pushRef = (literal: Literal) => {
    const cst = literal.$cstNode;
    if (!cst) return;
    const span = spanWithRe(cst, LITERAL_PRED_RE);
    if (!span) return;
    const target = definitionOffset.get(literal.predicate);
    if (target === undefined) return;
    refs.push({
      predicate: literal.predicate,
      offset: span.offset,
      end: span.end,
      definitionOffset: target,
    });
  };

  for (const predRules of analyzed.rules.values()) {
    for (const rule of predRules) {
      for (const elem of rule.body) {
        if (elem.$type === "Literal") pushRef(elem);
      }
    }
  }
  for (const query of analyzed.queries) {
    for (const elem of query.body) {
      if (elem.$type === "Literal") pushRef(elem);
    }
  }

  refs.sort((a, b) => a.offset - b.offset);
  return refs;
}
