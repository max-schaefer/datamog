// Editor decoration that renders a small superscript glyph after each
// body atom that recurses into its rule's SCC. The linter computes the
// spans (see `findRecursiveCalls` in datamog-core) and dispatches them
// to the editor via `setRecursiveCalls`; this StateField turns each
// span into a CodeMirror widget at the atom's end offset, and the
// theme styles it as a superscript.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { SourceSpan } from "../worker/bridge.ts";

class RecursiveCallWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-recursive-call";
    // `↻` (clockwise gapped circle arrow): unambiguous "loop"
    // semantics, renders well at small sizes, no ligature surprises.
    span.textContent = "↻";
    span.setAttribute("aria-label", "recursive call");
    span.title = "Recursive call (loops back into this rule's stratum)";
    return span;
  }

  // Two widgets at the same position with the same content compare
  // equal; CodeMirror skips re-creating the DOM, which keeps the
  // decoration update path fast under continuous typing.
  override eq(_other: WidgetType): boolean {
    return _other instanceof RecursiveCallWidget;
  }

  // The widget is decorative — readers tabbing through the editor
  // shouldn't stop on it.
  override ignoreEvent(): boolean {
    return true;
  }
}

const widget = new RecursiveCallWidget();

/** Replace the editor's recursive-call markers with the given spans. */
export const setRecursiveCalls = StateEffect.define<readonly SourceSpan[]>();

export const recursiveCallField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setRecursiveCalls)) {
        const docLen = tr.state.doc.length;
        // Sort by offset so `Decoration.set` doesn't have to. Spans
        // arriving from the worker are already sorted (see
        // `findRecursiveCalls`), but a defensive sort keeps the
        // contract local to this file.
        const spans = [...effect.value]
          .filter((s) => s.end <= docLen)
          .sort((a, b) => a.end - b.end);
        next = Decoration.set(
          spans.map((s) =>
            // `side: 1` = the widget renders *after* the position,
            // so it appears just past the atom's closing paren.
            Decoration.widget({ widget, side: 1 }).range(s.end),
          ),
        );
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});
