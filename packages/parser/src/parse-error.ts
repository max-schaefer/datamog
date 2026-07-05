/**
 * Thrown when a parse — including post-processing — fails. Carries
 * line/column for human-readable rendering and a byte `offset` / `end`
 * pair for editor tooling (the playground's lint squiggly reads
 * `offset` / `end` directly so the marker lands at the offending token
 * rather than at byte 0).
 */
export class ParseError extends Error {
  line: number;
  column: number;
  /** Byte offset of the error within the source. Mirrors `AnalyzerError.offset`
   *  so consumers can use one position API for both error kinds. */
  offset?: number;
  /** Byte end-offset; equal to `offset + 1` when the error spans a single
   *  character, undefined when no offset is known. */
  end?: number;

  constructor(message: string, line: number, column: number, offset?: number) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = "ParseError";
    this.line = line;
    this.column = column;
    if (offset !== undefined) {
      this.offset = offset;
      this.end = offset + 1;
    }
  }
}
