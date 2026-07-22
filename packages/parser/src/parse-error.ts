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
  /** Source file the error is in. Undefined for file-less input (a REPL
   *  chunk, stdin, an in-memory editor buffer). Set by `parse(source, file)`. */
  file?: string;

  constructor(message: string, line: number, column: number, offset?: number, file?: string) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = "ParseError";
    this.line = line;
    this.column = column;
    if (offset !== undefined) {
      this.offset = offset;
      this.end = offset + 1;
    }
    this.file = file;
  }
}
