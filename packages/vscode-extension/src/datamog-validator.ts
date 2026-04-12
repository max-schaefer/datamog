import { AnalyzerError, analyze, inferTypes } from "datamog-core";
import type { DatamogAstType, Program } from "datamog-parser";
import { postProcess } from "datamog-parser";
import type { AstNode, ValidationAcceptor, ValidationChecks } from "langium";

export function registerValidationChecks(registry: {
  register(checks: ValidationChecks<DatamogAstType>): void;
}): void {
  const checks: ValidationChecks<DatamogAstType> = {
    Program: validateProgram,
  };
  registry.register(checks);
}

function validateProgram(program: Program, accept: ValidationAcceptor): void {
  postProcess(program);

  try {
    const analyzed = analyze(program);
    inferTypes(analyzed);
  } catch (e) {
    if (e instanceof AnalyzerError) {
      accept("error", e.message, { node: program as AstNode });
    }
  }
}
