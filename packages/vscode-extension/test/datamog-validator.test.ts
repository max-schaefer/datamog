import { describe, expect, test } from "bun:test";
import { createDatamogServices } from "datamog-parser";
import type { Program } from "datamog-parser";
import type { AstNode } from "langium";
import { registerValidationChecks } from "../src/datamog-validator.ts";

interface CapturedDiagnostic {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  node: AstNode;
}

const services = createDatamogServices();
const parser = services.Datamog.parser.LangiumParser;

function runValidator(source: string): CapturedDiagnostic[] {
  // The validator runs against an AST that hasn't gone through
  // `postProcess` yet — that mirrors Langium's pipeline (parse →
  // validate, with post-process happening inside the validator).
  // The standalone `parse()` helper in `datamog-parser` calls
  // `postProcess` automatically, so use the Langium parser directly.
  const program = parser.parse<Program>(source).value;
  const captured: CapturedDiagnostic[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: mock validation registry
  let validator: any;
  registerValidationChecks({
    register(checks: { Program: typeof validator }) {
      validator = checks.Program;
    },
  });
  validator(
    program,
    (severity: CapturedDiagnostic["severity"], message: string, info: { node: AstNode }) => {
      captured.push({ severity, message, node: info.node });
    },
  );
  return captured;
}

describe("datamog-validator", () => {
  test("Regression: post-process errors anchor on the offending node, not the whole program", () => {
    // The validator caught `postProcess`'s ParseError but passed
    // `{ node: program }` to `accept()`, anchoring the diagnostic on
    // the entire document. The empty-bracket-access error carries
    // `offset` / `end` (since the round-7 fix), so the validator
    // should locate the precise BracketAccess node — same shape as
    // the analyzer-error branch a few lines below.
    const source = "r(C) :- w(W), C = W[].";
    const diagnostics = runValidator(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe("error");
    expect(diagnostics[0]!.message).toMatch(/Empty bracket access/);
    // The diagnostic should NOT anchor on the whole Program — that
    // would highlight the entire document.
    expect(diagnostics[0]!.node.$type).not.toBe("Program");
  });

  test("Regression: finiteness warnings are surfaced (parity with playground)", () => {
    // The playground's worker calls `findInfiniteRisks` after
    // `inferTypes` and surfaces results as severity:"warning"
    // diagnostics so the editor renders yellow squigglies on
    // infinite-risk predicates. The VS Code validator skipped this
    // step, so a user editing in VS Code never saw the warnings their
    // playground-using collaborators were seeing for the same source.
    const source = `
      extensional p(x: integer).
      grow(X) :- p(X).
      grow(X + 1) :- grow(X).
      ?- grow(Y).
    `;
    const diagnostics = runValidator(source);
    const warnings = diagnostics.filter((d) => d.severity === "warning");
    expect(warnings.length).toBeGreaterThan(0);
  });
});
