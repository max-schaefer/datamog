import { type AstNode, AstUtils } from "langium";
import type { Program } from "./generated/ast.js";
import { isBinaryExpr, isNumberLiteral, isVariable } from "./generated/ast.js";

/**
 * Post-parse transforms applied to the Langium AST:
 * 1. Desugar don't-care variables: rename every `_` to a unique `_0`, `_1`, ...
 * 2. Normalize `mod` operator to `%` in BinaryExpr nodes.
 * 3. Preserve the source text of numeric literals on a `rawText` property so the
 *    translator can distinguish `1` (integer) from `1.0` (real) — information
 *    that is otherwise lost when the lexer coerces NUMBER to a JS `number`.
 */
export function postProcess(program: Program): void {
  let anonCounter = 0;

  for (const node of streamAll(program)) {
    if (isVariable(node) && node.name === "_") {
      (node as { name: string }).name = `_${anonCounter++}`;
    }
    if (isBinaryExpr(node) && node.op === "mod") {
      (node as { op: string }).op = "%";
    }
    if (isNumberLiteral(node)) {
      const text = node.$cstNode?.text;
      if (text !== undefined) {
        (node as { rawText?: string }).rawText = text;
      }
    }
  }
}

/** Yield all AST nodes in the tree (depth-first). */
function* streamAll(root: AstNode): Generator<AstNode> {
  yield root;
  yield* AstUtils.streamAllContents(root);
}
