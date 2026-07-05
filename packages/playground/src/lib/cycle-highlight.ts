// Editor decoration that highlights the in-code positions participating
// in a finiteness cycle. Two sources feed it:
//   - `setPinnedCycle` — driven by the App when the "Show cycle" modal
//     is open. Pinned spans win whenever they're present.
//   - `setHoverCycle` — driven by the editor's own hover plugin (see
//     `cycleHoverPlugin`) when the user mouses over a warning squiggly.
// The decoration provider falls back from pinned → hover so closing the
// modal smoothly hands control back to whatever's currently hovered.

import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { ActiveCycle, SourceSpan } from "../worker/bridge.ts";

const highlightMark = Decoration.mark({ class: "cm-cycle-highlight" });

interface CycleHighlightState {
  pinnedSpans: readonly SourceSpan[];
  hoverSpans: readonly SourceSpan[];
}

export const setPinnedCycle = StateEffect.define<readonly SourceSpan[]>();
export const setHoverCycle = StateEffect.define<readonly SourceSpan[]>();

export const cycleHighlightField = StateField.define<CycleHighlightState>({
  create() {
    return { pinnedSpans: [], hoverSpans: [] };
  },
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setPinnedCycle)) next = { ...next, pinnedSpans: effect.value };
      else if (effect.is(setHoverCycle)) next = { ...next, hoverSpans: effect.value };
    }
    return next;
  },
  provide: (f) =>
    EditorView.decorations.compute([f], (state) => {
      const v = state.field(f);
      const docLen = state.doc.length;
      const source = v.pinnedSpans.length > 0 ? v.pinnedSpans : v.hoverSpans;
      const ranges = source
        .filter((s) => s.start < s.end && s.end <= docLen)
        .sort((a, b) => a.start - b.start || a.end - b.end)
        .map((s) => highlightMark.range(s.start, s.end));
      return Decoration.set(ranges);
    }),
});

// ─────────────────────────────────────────────────────────────────────
// Diagnostic-cycle lookup: maps "warning at byte range [from, to]" to
// its FinitenessCycle. Populated by the linter alongside the
// diagnostics themselves; consumed by the hover plugin below.
// ─────────────────────────────────────────────────────────────────────

export interface DiagnosticCycle {
  from: number;
  to: number;
  cycle: ActiveCycle;
}

export const setDiagnosticCycles = StateEffect.define<readonly DiagnosticCycle[]>();

export const diagnosticCyclesField = StateField.define<readonly DiagnosticCycle[]>({
  create() {
    return [];
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiagnosticCycles)) return effect.value;
    }
    return value;
  },
});

function cycleAtPos(state: EditorState, pos: number): ActiveCycle | null {
  for (const entry of state.field(diagnosticCyclesField)) {
    if (pos >= entry.from && pos <= entry.to) return entry.cycle;
  }
  return null;
}

/** Convert any cycle's per-node spans into editor-ready SourceSpans. */
export function cycleToSpans(cycle: ActiveCycle): SourceSpan[] {
  return cycle.cycle.nodes.flatMap((n) => n.spans.map((s) => ({ start: s.offset, end: s.end })));
}

// ─────────────────────────────────────────────────────────────────────
// Hover plugin: when the mouse is over a `.cm-lintRange-warning`
// element, look up the cycle at that position and dispatch it as the
// hover source. Mouse leaving clears it. Pinned-wins logic in the
// decoration provider means hover is silently overridden whenever a
// cycle is pinned by the modal.
// ─────────────────────────────────────────────────────────────────────

// Catch both kinds of squiggly: warnings (finiteness) and errors
// (non-stratified negation). Either may carry a cycle.
const SQUIGGLY_SELECTOR = ".cm-lintRange-warning, .cm-lintRange-error";

export const cycleHoverPlugin = ViewPlugin.fromClass(
  class {
    private current: ActiveCycle | null = null;
    private readonly view: EditorView;
    private readonly onOver: (e: MouseEvent) => void;
    private readonly onOut: (e: MouseEvent) => void;

    constructor(view: EditorView) {
      this.view = view;
      this.onOver = (e) => this.handleOver(e);
      this.onOut = (e) => this.handleOut(e);
      view.dom.addEventListener("mouseover", this.onOver);
      view.dom.addEventListener("mouseout", this.onOut);
    }

    destroy() {
      this.view.dom.removeEventListener("mouseover", this.onOver);
      this.view.dom.removeEventListener("mouseout", this.onOut);
      if (this.current) {
        // Defensive cleanup: a destroy in the middle of a hover would
        // otherwise leave a stale hoverSpans state.
        this.current = null;
        this.view.dispatch({ effects: setHoverCycle.of([]) });
      }
    }

    private handleOver(e: MouseEvent) {
      const target = (e.target as Element | null)?.closest?.(SQUIGGLY_SELECTOR);
      if (!target) return;
      const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return;
      const cycle = cycleAtPos(this.view.state, pos);
      if (cycle === this.current) return;
      this.current = cycle;
      this.view.dispatch({
        effects: setHoverCycle.of(cycle ? cycleToSpans(cycle) : []),
      });
    }

    private handleOut(e: MouseEvent) {
      const target = (e.target as Element | null)?.closest?.(SQUIGGLY_SELECTOR);
      if (!target) return;
      // If the mouse moved to another squiggly span, the next mouseover
      // will refresh the highlight — don't clear in between.
      const next = (e.relatedTarget as Element | null)?.closest?.(SQUIGGLY_SELECTOR);
      if (next) return;
      if (this.current) {
        this.current = null;
        this.view.dispatch({ effects: setHoverCycle.of([]) });
      }
    }
  },
);
