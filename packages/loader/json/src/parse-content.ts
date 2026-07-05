// Buffer/Bun-free whole-file JSON parser, shared between the Bun-side
// directory `JsonLoader`, the `UrlJsonLoader`, and platform-neutral
// consumers (the VS Code extension's on-disk loader). The module is
// deliberately free of `node:`/`Bun.*` imports — and, unlike
// `json-loader.ts`, it does not import `datamog-engine/directory-loader`
// (which references `Bun.file`) — so it is safe to bundle anywhere.

import type { ExtDecl } from "datamog-core";
import { checkValue } from "datamog-engine";

export interface ParseJsonOptions {
  /** Used in error messages to identify the source (file path or predicate name). */
  source?: string;
}

/**
 * Parse whole-file JSON content into a single typed row according to
 * `decl`. Only applies when the declaration has exactly one value-typed
 * column — the natural shape for "load this configuration blob and let
 * rules destructure it".
 */
export function parseJsonContent(
  content: string,
  decl: ExtDecl,
  options: ParseJsonOptions = {},
): Record<string, unknown>[] {
  const source = options.source ?? `${decl.predicate}.json`;
  if (decl.columns.length !== 1 || decl.columns[0]!.type !== "value") {
    throw new Error(
      `${source}: whole-file JSON sources require '${decl.predicate}' to have exactly one value column`,
    );
  }

  const col = decl.columns[0]!;
  // Bare `JSON.parse` throws a `SyntaxError` whose message omits the
  // filename, leaving the user unable to locate the offending file from
  // the error alone. Wrap with the same `<predicate>.json: ...` prefix
  // `checkValue` uses so a sloppy file surfaces actionable context.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`${source}: ${(e as Error).message}`);
  }
  const value = checkValue(parsed, "value", source);
  return [{ [col.name]: value }];
}
