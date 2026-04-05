import type { Span } from "./ast.ts";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly span: Span,
  ) {
    super(`${message} at line ${span.line}, column ${span.column}`);
    this.name = "ParseError";
  }
}
