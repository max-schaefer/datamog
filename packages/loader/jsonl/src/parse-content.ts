import type { ExtDecl } from "datamog-core";
import { checkColumnValue } from "datamog-engine";

export interface ParseJsonlOptions {
  /** Used in error messages to identify the source (file path or predicate name). */
  source?: string;
}

/**
 * Parse JSONL content into typed rows according to `decl`. Each non-blank
 * line is a JSON value: an object keyed by column name, or a positional
 * array. Shared between the directory-based `JsonlLoader`, the CLI's
 * explicit-file loader, and the browser playground's in-memory loader so
 * none of them can drift in either error wording or accepted shapes. The
 * module is deliberately free of `node:`/`Bun.*` imports so it can be
 * bundled into the browser playground worker.
 *
 * Special case: a declaration with a single `json`-typed column treats
 * each line as the column value directly (any JSON shape) — no
 * positional/keyed unwrapping. This is the natural shape for ingesting
 * heterogeneous self-describing records.
 */
export function parseJsonlContent(
  content: string,
  decl: ExtDecl,
  options: ParseJsonlOptions = {},
): Record<string, unknown>[] {
  const source = options.source ?? `${decl.predicate}.jsonl`;
  // Strip a leading UTF-8 BOM (U+FEFF). `Bun.file(...).text()` does
  // this transparently for the directory-loader path, but callers
  // that hand JSONL text in directly (the playground in-memory
  // loader, anything routing through `parse-content` without going
  // via `Bun.file`) reach this function with the BOM intact, and
  // `JSON.parse` rejects U+FEFF as an unexpected token — surfacing
  // a confusing `Unrecognized token '﻿'` error on what looks like
  // valid JSONL.
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  // Track each non-blank line's 1-based position in the *source* file.
  // Filtering blank lines first and then numbering by post-filter index
  // would shift error messages by however many blank lines preceded the
  // error, pointing the user at the wrong line.
  const lines: { line: string; lineNum: number }[] = [];
  const rawLines = stripped.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    if (line.trim() === "") continue;
    lines.push({ line, lineNum: i + 1 });
  }

  const singleJsonColumn =
    decl.columns.length === 1 && decl.columns[0]!.type === "value" ? decl.columns[0]! : undefined;

  return lines.map(({ line, lineNum }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      // Bare `JSON.parse` throws a `SyntaxError` whose message carries
      // no file or line context, leaving the user to find the line
      // themselves. Wrap with the same `<source> line N: …` prefix
      // every other error path here uses.
      throw new Error(`${source} line ${lineNum}: ${(e as Error).message}`);
    }

    if (singleJsonColumn) {
      return {
        [singleJsonColumn.name]: checkColumnValue(
          parsed,
          singleJsonColumn,
          `${source} line ${lineNum}, column '${singleJsonColumn.name}'`,
        ),
      };
    }

    if (Array.isArray(parsed)) {
      if (parsed.length !== decl.columns.length) {
        throw new Error(
          `${source} line ${lineNum}: expected ${decl.columns.length} fields but got ${parsed.length}`,
        );
      }
      const row: Record<string, unknown> = {};
      for (let j = 0; j < decl.columns.length; j++) {
        const col = decl.columns[j]!;
        row[col.name] = checkColumnValue(
          parsed[j],
          col,
          `${source} line ${lineNum}, column '${col.name}'`,
        );
      }
      return row;
    }
    if (isJsonObject(parsed)) {
      const row: Record<string, unknown> = {};
      for (const col of decl.columns) {
        // `Object.hasOwn`, not `col.name in parsed`: the latter walks the
        // prototype chain, so a column named like an `Object.prototype`
        // member (`toString`, `valueOf`, `constructor`, …) would match the
        // inherited member even when this object lacks the key — bypassing
        // the missing-field error and then reading the inherited function.
        if (!Object.hasOwn(parsed, col.name)) {
          throw new Error(`${source} line ${lineNum}: missing field '${col.name}'`);
        }
        row[col.name] = checkColumnValue(
          parsed[col.name],
          col,
          `${source} line ${lineNum}, column '${col.name}'`,
        );
      }
      return row;
    }
    throw new Error(`${source} line ${lineNum}: expected object or array, got ${typeof parsed}`);
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
