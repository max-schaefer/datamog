import {
  AnalyzerError,
  analyze,
  checkModuleBoundaries,
  elaborate,
  findInfiniteRisks,
  inferTypes,
} from "datamog-core";
import { createNodeModuleResolver } from "datamog-engine/module-resolver";
import type { DatamogAstType, ExtDecl, Program } from "datamog-parser";
import { ParseError, parseRaw, postProcess } from "datamog-parser";
import type { AstNode } from "langium";
import { AstUtils } from "langium";
import type { ValidationAcceptor, ValidationChecks } from "langium";

type Analyzed = ReturnType<typeof inferTypes>;

export function registerValidationChecks(registry: {
  register(checks: ValidationChecks<DatamogAstType>): void;
}): void {
  const checks: ValidationChecks<DatamogAstType> = {
    Program: validateProgram,
  };
  registry.register(checks);
}

function validateProgram(program: Program, accept: ValidationAcceptor): void {
  // A program with `:=` source bindings must be elaborated (module imports
  // resolved from disk) before analysis; that path re-parses into a throwaway
  // AST so the Langium document is left intact for the other LSP features.
  const hasBinding = program.statements.some(
    (s) => s.$type === "ExtDecl" && (s as ExtDecl).binding !== undefined,
  );
  const analyzed = hasBinding
    ? analyzeWithModules(program, accept)
    : analyzeInPlace(program, accept);
  if (!analyzed) return;

  // Surface finiteness/unboundedness warnings so VS Code shows the
  // same yellow squigglies the playground linter does (parity with
  // `packages/playground/src/worker/executor.ts:351`).
  for (const risk of findInfiniteRisks(analyzed)) {
    const target =
      risk.offset !== undefined ? (findNodeAtOffset(program, risk.offset) ?? program) : program;
    accept("warning", risk.message, { node: target });
  }
}

/** Post-process and analyse the parsed document in place (the binding-free path). */
function analyzeInPlace(program: Program, accept: ValidationAcceptor): Analyzed | undefined {
  // postProcess can throw on malformed AST shapes the parser accepted
  // (e.g. empty `W[]`); catch it so the validator surfaces the problem
  // as a diagnostic rather than crashing the language server.
  try {
    postProcess(program);
  } catch (e) {
    reportError(program, accept, e);
    return undefined;
  }
  try {
    return inferTypes(analyze(program));
  } catch (e) {
    if (e instanceof AnalyzerError) {
      reportError(program, accept, e);
      return undefined;
    }
    throw e;
  }
}

/**
 * Elaborate the document's `:=` bindings, then analyse the merged program.
 * Re-parses the source into a fresh AST so the elaborator's in-place mutation
 * (and the merged-in module statements) never touch the Langium document model.
 * Diagnostics anchor via the original document's offsets, which line up for the
 * importing file's own statements (errors inside an imported module fall back to
 * the whole document — precise cross-file positions are future work).
 */
function analyzeWithModules(program: Program, accept: ValidationAcceptor): Analyzed | undefined {
  const uri = program.$document?.uri;
  const file = uri?.scheme === "file" ? uri.fsPath : undefined;
  // Prefer the document's full text (offsets line up exactly); fall back to the
  // root CST text when no document is attached (e.g. a bare-parser test).
  const text = program.$document?.textDocument.getText() ?? program.$cstNode?.text ?? "";
  try {
    const raw = parseRaw(text, file);
    const { program: merged, boundaries } = elaborate(raw, createNodeModuleResolver(), file);
    postProcess(merged);
    const analyzed = inferTypes(analyze(merged, file));
    checkModuleBoundaries(analyzed, boundaries);
    return analyzed;
  } catch (e) {
    // A missing/unreadable module, an import cycle, or a boundary type mismatch
    // becomes a diagnostic rather than crashing the language server.
    reportError(program, accept, e);
    return undefined;
  }
}

/** Anchor an error on the offending term when it carries a source offset,
 *  otherwise on the whole document. */
function reportError(program: Program, accept: ValidationAcceptor, e: unknown): void {
  const offset = e instanceof ParseError || e instanceof AnalyzerError ? e.offset : undefined;
  const target = offset !== undefined ? (findNodeAtOffset(program, offset) ?? program) : program;
  accept("error", e instanceof Error ? e.message : String(e), { node: target });
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
