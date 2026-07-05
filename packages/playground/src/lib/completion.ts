import type {
  CompletionResult as CmCompletionResult,
  Completion,
  CompletionContext,
} from "@codemirror/autocomplete";
import * as bridge from "../worker/bridge.ts";
import { boostFor, iconType } from "./completion-candidates.ts";

// Datamog identifiers (predicates, functions, variables) match this
// shape — the highlighter uses the same character classes. We feed it
// to both `matchBefore` (to find where the user-typed prefix starts)
// and `validFor` (so CodeMirror keeps filtering the existing list as
// the user types without firing another worker round-trip).
const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/;
const VALID_FOR_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * CodeMirror completion source. Wired into the editor via
 * `autocompletion({ override: [datamogCompletionSource] })`. Returns a
 * promise so the worker round-trip stays off the main thread.
 *
 * Disambiguation between "predicate position", "function position", and
 * "variable position" — which the VS Code provider does grammar-feature-
 * by-grammar-feature — is delegated to CodeMirror's prefix matcher.
 * Variables start with an uppercase letter or `_`, predicates and
 * builtins with a lowercase letter, so a single keystroke is enough to
 * narrow the list to the right category without per-position dispatch.
 */
export async function datamogCompletionSource(
  ctx: CompletionContext,
): Promise<CmCompletionResult | null> {
  const word = ctx.matchBefore(IDENT_RE);
  // Don't pop up automatically when the cursor sits in whitespace —
  // only fire on an explicit Ctrl/Cmd-Space in that case. Otherwise
  // every space the user types would trigger a worker request. With
  // `explicit`, we still propose: `from` falls back to the cursor
  // position so the inserted text replaces nothing.
  if (!word && !ctx.explicit) return null;
  if (word && word.from === word.to && !ctx.explicit) return null;
  const from = word ? word.from : ctx.pos;

  const source = ctx.state.doc.toString();
  const result = await bridge.complete(source, ctx.pos);
  if (ctx.aborted) return null;

  const options: Completion[] = result.candidates.map((c) => ({
    label: c.label,
    type: iconType(c.kind),
    detail: c.detail,
    boost: boostFor(c.kind),
  }));

  return {
    from,
    options,
    validFor: VALID_FOR_RE,
  };
}
