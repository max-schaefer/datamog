import { AnalyzerError, analyze, findInfiniteRisks, inferTypes } from "datamog-core";
import type { DatamogAstType, Program } from "datamog-parser";
import { ParseError, postProcess } from "datamog-parser";
import type { AstNode } from "langium";
import { AstUtils } from "langium";
import type { ValidationAcceptor, ValidationChecks } from "langium";

export function registerValidationChecks(registry: {
  register(checks: ValidationChecks<DatamogAstType>): void;
}): void {
  const checks: ValidationChecks<DatamogAstType> = {
    Program: validateProgram,
  };
  registry.register(checks);
}

function validateProgram(program: Program, accept: ValidationAcceptor): void {
  // postProcess can throw on malformed AST shapes the parser accepted
  // (e.g. empty `W[]`); catch it so the validator surfaces the problem
  // as a diagnostic rather than crashing the language server.
  try {
    postProcess(program);
  } catch (e) {
    // `postProcess` throws `ParseError` with a numeric `offset` when
    // a CST node is available; route through `findNodeAtOffset` so
    // the diagnostic anchors on the offending term rather than the
    // whole document. Same shape as the analyzer-error branch below.
    const offset = e instanceof ParseError ? e.offset : undefined;
    const target = offset !== undefined ? (findNodeAtOffset(program, offset) ?? program) : program;
    accept("error", e instanceof Error ? e.message : String(e), { node: target });
    return;
  }

  let analyzed: ReturnType<typeof inferTypes> | undefined;
  try {
    analyzed = inferTypes(analyze(program));
  } catch (e) {
    if (e instanceof AnalyzerError) {
      const target =
        e.offset !== undefined ? (findNodeAtOffset(program, e.offset) ?? program) : program;
      accept("error", e.message, { node: target });
      return;
    }
    throw e;
  }

  // Surface finiteness/unboundedness warnings so VS Code shows the
  // same yellow squigglies the playground linter does (parity with
  // `packages/playground/src/worker/executor.ts:351`).
  for (const risk of findInfiniteRisks(analyzed)) {
    const target =
      risk.offset !== undefined ? (findNodeAtOffset(program, risk.offset) ?? program) : program;
    accept("warning", risk.message, { node: target });
  }
}

/**
 * Walk the AST to find the deepest node whose CST span contains `offset`.
 * Used to anchor analyzer diagnostics on a precise node rather than the
 * whole program — without this, every semantic error highlights the entire
 * document and the user can't tell what's wrong.
 */
function findNodeAtOffset(program: Program, offset: number): AstNode | undefined {
  let best: AstNode | undefined;
  let bestSize = Number.POSITIVE_INFINITY;
  for (const node of AstUtils.streamAllContents(program)) {
    const cst = node.$cstNode;
    if (!cst) continue;
    if (offset < cst.offset || offset >= cst.end) continue;
    const size = cst.end - cst.offset;
    if (size < bestSize) {
      bestSize = size;
      best = node;
    }
  }
  return best;
}
