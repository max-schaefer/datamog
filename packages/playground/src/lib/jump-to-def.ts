// Cmd/Ctrl+click jump-to-definition for predicate references in the
// editor. The linter ships a list of `{ start, end, target }` spans
// from the worker; this extension stores them in a StateField, marks
// each one with `cm-pred-ref` (used by CSS to underline on
// modifier+hover), and listens for clicks with the modifier held.
//
// "The modifier" is `metaKey` on macOS and `ctrlKey` everywhere else.
// We detect the platform once at import time so the matching cost is
// O(1) per click.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { PredicateReferenceSpan } from "../worker/bridge.ts";

const refMark = Decoration.mark({ class: "cm-pred-ref" });

/** Replace the editor's predicate-reference set with the given spans. */
export const setPredicateReferences = StateEffect.define<readonly PredicateReferenceSpan[]>();

/** Field that holds both the marker decorations and the raw refs (so the click handler can look up targets). */
const referencesField = StateField.define<{
  decorations: DecorationSet;
  refs: readonly PredicateReferenceSpan[];
}>({
  create() {
    return { decorations: Decoration.none, refs: [] };
  },
  update(value, tr) {
    let decorations = value.decorations.map(tr.changes);
    let refs = value.refs;
    for (const effect of tr.effects) {
      if (effect.is(setPredicateReferences)) {
        const docLen = tr.state.doc.length;
        const valid = effect.value.filter((r) => r.start >= 0 && r.end <= docLen);
        // CodeMirror requires the decoration ranges in `Decoration.set`
        // to be sorted by start; spans arrive in source order from the
        // worker, but a defensive sort keeps the contract local.
        const sorted = [...valid].sort((a, b) => a.start - b.start);
        decorations = Decoration.set(sorted.map((r) => refMark.range(r.start, r.end)));
        refs = sorted;
      }
    }
    return { decorations, refs };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function jumpModifierHeld(event: MouseEvent | KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

const clickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    if (!jumpModifierHeld(event)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const { refs } = view.state.field(referencesField);
    // `pos` is the cursor position between characters; treat the
    // reference's [start, end) as half-open so a click on the very
    // first character of the IDENT still hits.
    const ref = refs.find((r) => pos >= r.start && pos < r.end);
    if (!ref) return false;
    event.preventDefault();
    // Land the cursor at the definition's start and scroll it into
    // view. `selection: { anchor }` collapses any existing selection.
    view.dispatch({
      selection: { anchor: ref.target },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  },
});

// Hover affordance: while the jump modifier is held, every
// `cm-pred-ref` should look clickable (underline + pointer cursor).
// The body-level class toggle lets the CSS stay declarative.
const modifierClassPlugin = EditorView.domEventHandlers({
  // We attach to the editor DOM, not document, to avoid global side
  // effects when the page has multiple editors.
  // biome-ignore lint/suspicious/noExplicitAny: keydown event narrow doesn't help here
  keydown(_event: any, view) {
    if (jumpModifierHeld(_event)) view.dom.classList.add("cm-pred-ref-armed");
    return false;
  },
  // biome-ignore lint/suspicious/noExplicitAny: same reason
  keyup(_event: any, view) {
    if (!jumpModifierHeld(_event)) view.dom.classList.remove("cm-pred-ref-armed");
    return false;
  },
  // The class is per-editor, but if focus leaves the editor while the
  // modifier is still held the keyup never fires here. Drop it on
  // blur as a safety net.
  blur(_event, view) {
    view.dom.classList.remove("cm-pred-ref-armed");
    return false;
  },
});

/** All extensions needed to enable jump-to-definition for predicates. */
export const predicateReferences = [referencesField, clickHandler, modifierClassPlugin];
