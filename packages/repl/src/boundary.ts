/**
 * Best-effort statement-boundary detection for the interactive REPL.
 *
 * Datamog's grammar terminates every top-level statement with `.`, so we
 * call a buffer "ready to attempt parsing" once we've seen at least one
 * unquoted top-level `.` AND the structural delimiters (`(`/`)`, `[`/`]`,
 * `{`/`}`) are balanced. Inside `"..."` strings, `` `...` `` quoted
 * idents, and `# ...` line comments, none of these characters count.
 *
 * The check is intentionally a heuristic: a buffer that passes here may
 * still fail to parse (e.g. a syntax error before the period). The caller
 * runs the parser and surfaces the error normally. The point of this
 * function is only to decide *when to stop accumulating* in interactive
 * mode — JSON mode uses an explicit blank-line boundary instead.
 */
export function isInputComplete(buffer: string): boolean {
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  let sawTerminator = false;

  let i = 0;
  while (i < buffer.length) {
    const c = buffer[i]!;

    if (c === "#") {
      // Line comment to end of line.
      while (i < buffer.length && buffer[i] !== "\n") i++;
      continue;
    }

    if (c === '"') {
      i++;
      while (i < buffer.length) {
        const ch = buffer[i]!;
        if (ch === "\\" && i + 1 < buffer.length) {
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "`") {
      i++;
      while (i < buffer.length) {
        const ch = buffer[i]!;
        if (ch === "\\" && i + 1 < buffer.length) {
          i += 2;
          continue;
        }
        if (ch === "`") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "(") parens++;
    else if (c === ")") parens--;
    else if (c === "[") brackets++;
    else if (c === "]") brackets--;
    else if (c === "{") braces++;
    else if (c === "}") braces--;
    else if (c === ".") {
      // Don't treat `1.5` (a number literal) as a terminator. The
      // grammar's NUMBER terminal is `[0-9]+(\.[0-9]+)?`, so a dot
      // sandwiched between digits is part of a numeric token; only
      // dots that aren't between digits matter for terminator
      // detection.
      const prev = i > 0 ? buffer[i - 1] : undefined;
      const next = i + 1 < buffer.length ? buffer[i + 1] : undefined;
      const prevIsDigit = prev !== undefined && prev >= "0" && prev <= "9";
      const nextIsDigit = next !== undefined && next >= "0" && next <= "9";
      if (!(prevIsDigit && nextIsDigit) && parens === 0 && brackets === 0 && braces === 0) {
        sawTerminator = true;
      }
    }

    i++;
  }

  return sawTerminator && parens === 0 && brackets === 0 && braces === 0;
}

/**
 * Heuristic: should the interactive REPL commit this buffer as soon as
 * it parses, or wait for a blank line first? Fast-commit fires on
 * chunks whose first significant token is `?` (a `?-` query) or the
 * `extensional` keyword (an EDB declaration). Both are stand-alone
 * statements: a query produces a result and an extensional declaration
 * names a new predicate that can't be extended later anyway.
 *
 * Rules are deliberately *not* fast-committed: rules for one predicate
 * commonly come in multi-line groups (e.g. base case + recursive case
 * for an `ancestor`), and the v1 IncrementalSession forbids extending
 * a predicate's rule set across chunks — so the safe default is to
 * accumulate until the user signals "done" with a blank line.
 *
 * Skips leading whitespace and `# ...` line comments so a comment
 * preceding the statement doesn't disqualify the chunk.
 */
export function isFastCommitChunk(buffer: string): boolean {
  let i = 0;
  while (i < buffer.length) {
    const c = buffer[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "#") {
      while (i < buffer.length && buffer[i] !== "\n") i++;
      continue;
    }
    if (c === "?") return true;
    // `extensional` is a reserved keyword in the grammar, so an exact
    // string match followed by a non-identifier char is unambiguous.
    const KW = "extensional";
    if (buffer.startsWith(KW, i)) {
      const next = buffer[i + KW.length];
      if (
        next === undefined ||
        next === " " ||
        next === "\t" ||
        next === "\n" ||
        next === "\r" ||
        next === "("
      ) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/** Convert a 0-based byte offset into a 1-based line/column pair. */
export function offsetToLineColumn(
  source: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      lastNl = i;
    }
  }
  return { line, column: offset - lastNl };
}
