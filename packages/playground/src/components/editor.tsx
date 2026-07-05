import { acceptCompletion, autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { forceLinting } from "@codemirror/lint";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { useEffect, useRef } from "preact/hooks";
import { datamogCompletionSource } from "../lib/completion.ts";
import {
  cycleHighlightField,
  cycleHoverPlugin,
  cycleToSpans,
  diagnosticCyclesField,
  setPinnedCycle,
} from "../lib/cycle-highlight.ts";
import { datamogLanguage } from "../lib/highlight.ts";
import { predicateReferences } from "../lib/jump-to-def.ts";
import { datamogLinter, refreshLintEffect } from "../lib/linter.ts";
import { recursiveCallField } from "../lib/recursive-marker.ts";
import type { ActiveCycle, AstElement, SourceSpan } from "../worker/bridge.ts";

interface EditorProps {
  source: string;
  onChange: (source: string) => void;
  elements: AstElement[] | null;
  hoveredRange: SourceSpan | null;
  onHoverRange: (range: SourceSpan | null) => void;
  showWarnings: boolean;
  /** Cycle currently shown in the modal — drives the in-code highlight. */
  activeCycle: ActiveCycle | null;
}

const highlightMark = Decoration.mark({ class: "cm-predicate-highlight" });

// CodeMirror's built-in `highlightActiveLine` paints the head line of
// *every* selection range, including non-empty (shift-selection) ranges.
// Because the active-line and the selection share `--primary-soft`, a
// shift-selection whose head lands on a new line washes that whole line
// full-width, blending with the selection so it reads as "the entire next
// line is selected". Restrict the active-line decoration to empty ranges
// (plain cursors) so it only shows when there is no selection.
const activeLineDeco = Decoration.line({ class: "cm-activeLine" });
const highlightActiveLineWhenCollapsed = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.computeDeco(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = this.computeDeco(update.view);
      }
    }

    private computeDeco(view: EditorView): DecorationSet {
      const deco = [];
      let lastLineStart = -1;
      for (const range of view.state.selection.ranges) {
        if (!range.empty) continue;
        const line = view.lineBlockAt(range.head);
        if (line.from > lastLineStart) {
          deco.push(activeLineDeco.range(line.from));
          lastLineStart = line.from;
        }
      }
      return Decoration.set(deco);
    }
  },
  { decorations: (v) => v.decorations },
);

const setHighlightSpan = StateEffect.define<SourceSpan | null>();

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHighlightSpan)) {
        const span = effect.value;
        const docLen = tr.state.doc.length;
        if (span && span.start < span.end && span.end <= docLen) {
          next = Decoration.set([highlightMark.range(span.start, span.end)]);
        } else {
          next = Decoration.none;
        }
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function rangesEqual(a: SourceSpan | null, b: SourceSpan | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

export function Editor({
  source,
  onChange,
  elements,
  hoveredRange,
  onHoverRange,
  showWarnings,
  activeCycle,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const elementsRef = useRef(elements);
  const onHoverRef = useRef(onHoverRange);
  onChangeRef.current = onChange;
  elementsRef.current = elements;
  onHoverRef.current = onHoverRange;

  // Create editor once: the EditorView is created with the initial `source`
  // and thereafter synced via the separate effect below. Listing `source` in
  // the deps would recreate the editor on every keystroke.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial-only effect, see comment above
  useEffect(() => {
    if (!containerRef.current) return;

    const hoverPlugin = ViewPlugin.fromClass(
      class {
        private lastRange: SourceSpan | null = null;
        private readonly view: EditorView;
        private readonly onMove: (e: MouseEvent) => void;
        private readonly onLeave: () => void;

        constructor(view: EditorView) {
          this.view = view;
          this.onMove = (e) => this.handleMove(e);
          this.onLeave = () => this.handleLeave();
          view.dom.addEventListener("mousemove", this.onMove);
          view.dom.addEventListener("mouseleave", this.onLeave);
        }

        update(_u: ViewUpdate) {}

        destroy() {
          this.view.dom.removeEventListener("mousemove", this.onMove);
          this.view.dom.removeEventListener("mouseleave", this.onLeave);
        }

        private handleMove(e: MouseEvent) {
          const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
          const els = elementsRef.current;
          if (pos === null || !els) {
            this.setRange(null);
            return;
          }
          // Elements are pre-sorted smallest-first; take the innermost containing pos.
          let found: SourceSpan | null = null;
          for (const el of els) {
            if (pos >= el.start && pos < el.end) {
              found = { start: el.start, end: el.end };
              break;
            }
          }
          this.setRange(found);
        }

        private handleLeave() {
          this.setRange(null);
        }

        private setRange(r: SourceSpan | null) {
          if (rangesEqual(r, this.lastRange)) return;
          this.lastRange = r;
          onHoverRef.current(r);
        }
      },
    );

    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          highlightActiveLineWhenCollapsed,
          history(),
          bracketMatching(),
          syntaxHighlighting(classHighlighter),
          datamogLanguage(),
          datamogLinter,
          highlightField,
          recursiveCallField,
          cycleHighlightField,
          diagnosticCyclesField,
          cycleHoverPlugin,
          ...predicateReferences,
          hoverPlugin,
          // Replace the default lezer-syntax-tree completion source
          // (Datamog uses a StreamLanguage, so there's no parsed tree
          // for the default source to walk) with our worker-backed
          // source. `autocompletion()` installs its own completion keymap,
          // but that only binds Enter / Ctrl-Space / arrows — *not* Tab —
          // so we add a Tab binding ourselves below.
          autocompletion({ override: [datamogCompletionSource] }),
          // Tab accepts the highlighted completion when the popup is open.
          // `acceptCompletion` returns false when no completion is active,
          // so Tab then falls through to `indentWithTab` (indent) below.
          // Highest precedence so it wins over `indentWithTab`'s Tab.
          Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "var(--surface)",
              color: "var(--text)",
            },
            ".cm-scroller": { overflow: "auto" },
            ".cm-gutters": {
              backgroundColor: "var(--surface-muted)",
              color: "var(--text-subtle)",
              border: "none",
              borderRight: "1px solid var(--border)",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "var(--primary-soft)",
              color: "var(--text)",
            },
            ".cm-activeLine": { backgroundColor: "var(--primary-soft)" },
            ".cm-cursor": { borderLeftColor: "var(--primary)" },
            // Deeper than the active-line wash (`--primary-soft`) so a
            // selection stays visually distinct from the current line.
            "&.cm-focused .cm-selectionBackground, ::selection": {
              backgroundColor: "var(--selection-bg)",
            },
            ".cm-matchingBracket, .cm-nonmatchingBracket": {
              backgroundColor: "var(--primary-soft)",
              outline: "1px solid var(--primary)",
            },
            ".cm-predicate-highlight": {
              backgroundColor: "var(--primary-soft)",
              borderRadius: "3px",
            },
            // Cycle-highlight: subtle amber background applied to every
            // head/body argument position that participates in the SCC
            // currently shown in the cycle modal. Tied visually to the
            // modal's "growing" colour so the reader can see where in
            // the source the diagram's nodes live.
            ".cm-cycle-highlight": {
              backgroundColor: "var(--warning-soft)",
              borderBottom: "1.5px solid var(--warning)",
              borderRadius: "2px",
            },
            // Recursive-call superscript glyph rendered after every
            // body atom that loops back into its rule's SCC. Sized to
            // match a small superscript and tinted with the primary
            // colour so it reads as "engine annotation" rather than
            // user-typed text.
            ".cm-recursive-call": {
              display: "inline-block",
              fontSize: "0.7em",
              verticalAlign: "super",
              lineHeight: "0",
              marginLeft: "1px",
              color: "var(--primary)",
              opacity: "0.75",
              userSelect: "none",
              pointerEvents: "auto",
              cursor: "help",
            },
            // Predicate references (Cmd/Ctrl+click jumps to the
            // definition). Show as a normal predicate by default; only
            // light up as a clickable link when the jump modifier is
            // held — `cm-pred-ref-armed` is toggled by the
            // `jump-to-def` extension on key press / blur.
            "&.cm-pred-ref-armed .cm-pred-ref": {
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: "var(--primary)",
              cursor: "pointer",
            },
            "&.cm-pred-ref-armed .cm-pred-ref:hover": {
              textDecorationStyle: "solid",
              textDecorationColor: "var(--primary)",
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
  }, []);

  // Update editor content when source changes externally (e.g. loading an example)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
    }
  }, [source]);

  // Update highlight decorations when the hovered range changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setHighlightSpan.of(hoveredRange) });
  }, [hoveredRange]);

  // The linter reads `getShowWarnings()` lazily, but only re-runs when
  // the document changes. Dispatch the refresh effect (which the linter's
  // `needsRefresh` hook watches for) and immediately force the run so
  // the squigglies update without the user having to re-type.
  const skipFirstWarningsEffect = useRef(true);
  useEffect(() => {
    if (skipFirstWarningsEffect.current) {
      skipFirstWarningsEffect.current = false;
      return;
    }
    void showWarnings;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: refreshLintEffect.of(null) });
    forceLinting(view);
  }, [showWarnings]);

  // Drive the *pinned* cycle highlight from the modal. Open modal →
  // dispatch the cycle's spans; close modal → dispatch empty (which
  // hands control back to the hover plugin, if a squiggly is currently
  // hovered). The hover source is managed entirely inside cycleHoverPlugin.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const spans: SourceSpan[] = activeCycle ? cycleToSpans(activeCycle) : [];
    view.dispatch({ effects: setPinnedCycle.of(spans) });
  }, [activeCycle]);

  return <div ref={containerRef} class="editor-container" />;
}
