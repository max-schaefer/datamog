import {
  type CompletionResult as CmCompletionResult,
  type CompletionContext,
  acceptCompletion,
  autocompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { boostFor, iconType } from "../lib/completion-candidates.ts";
import { datamogLanguage } from "../lib/highlight.ts";
import { collectCompletionCandidates, lintSource } from "./engine.ts";

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/;
const VALID_FOR_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Main-thread completion source — same candidate set as the playground,
// minus the worker round-trip (so it returns synchronously).
function embedCompletionSource(ctx: CompletionContext): CmCompletionResult | null {
  const word = ctx.matchBefore(IDENT_RE);
  if (!word && !ctx.explicit) return null;
  if (word && word.from === word.to && !ctx.explicit) return null;
  const from = word ? word.from : ctx.pos;
  const candidates = collectCompletionCandidates(ctx.state.doc.toString(), ctx.pos);
  return {
    from,
    options: candidates.map((c) => ({
      label: c.label,
      type: iconType(c.kind),
      detail: c.detail,
      boost: boostFor(c.kind),
    })),
    validFor: VALID_FOR_RE,
  };
}

// Main-thread linter — parse/analyse the buffer on each change and clamp
// spans to the current document so a stale offset can't throw.
const embedLinter = linter((view) => {
  const len = view.state.doc.length;
  return lintSource(view.state.doc.toString()).diagnostics.map(
    (d): Diagnostic => ({
      from: Math.min(d.from, len),
      to: Math.min(d.to, len),
      severity: d.severity,
      message: d.message,
    }),
  );
});

// Self-contained light theme: the embed can't assume the host page defines
// the playground's CSS variables, so colours are inlined here.
const embedTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    backgroundColor: "#fff",
    color: "#1f2328",
    border: "1px solid #d0d7de",
    borderRadius: "6px",
  },
  ".cm-content": { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-gutters": {
    backgroundColor: "#f6f8fa",
    color: "#8c959f",
    border: "none",
    borderRight: "1px solid #d0d7de",
  },
  ".cm-activeLine": { backgroundColor: "#f3f6fb" },
  ".cm-activeLineGutter": { backgroundColor: "#eef2f7" },
  ".cm-cursor": { borderLeftColor: "#0969da" },
  "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#cce5ff" },
  ".cm-matchingBracket": { backgroundColor: "#e6edf5", outline: "1px solid #0969da" },
});

/**
 * Create a CodeMirror editor for the embed: Datamog highlighting, main-thread
 * autocomplete and linting, history, bracket matching, Tab-to-accept. `extra`
 * carries per-instance extensions (the inline affordances). Returns the
 * `EditorView`; read `view.state.doc.toString()` to get the current source.
 */
export function createEmbedEditor(
  parent: HTMLElement,
  doc: string,
  extra: Extension = [],
): EditorView {
  return new EditorView({
    parent,
    doc,
    extensions: [
      lineNumbers(),
      history(),
      bracketMatching(),
      syntaxHighlighting(classHighlighter),
      datamogLanguage(),
      embedLinter,
      autocompletion({ override: [embedCompletionSource] }),
      // Tab accepts the active completion; falls through to indent otherwise.
      Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      embedTheme,
      EditorView.theme({ ".cm-content, .cm-gutter": { minHeight: "4rem" } }),
      extra,
    ],
  });
}
