import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "preact/hooks";
import { datamogLanguage } from "../lib/highlight.ts";
import { datamogLinter } from "../lib/linter.ts";
import type { AstElement, SourceSpan } from "../worker/bridge.ts";

interface EditorProps {
  source: string;
  onChange: (source: string) => void;
  elements: AstElement[] | null;
  hoveredRange: SourceSpan | null;
  onHoverRange: (range: SourceSpan | null) => void;
}

const highlightMark = Decoration.mark({ class: "cm-predicate-highlight" });

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

export function Editor({ source, onChange, elements, hoveredRange, onHoverRange }: EditorProps) {
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
          highlightActiveLine(),
          history(),
          bracketMatching(),
          syntaxHighlighting(defaultHighlightStyle),
          datamogLanguage(),
          datamogLinter,
          highlightField,
          hoverPlugin,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
            ".cm-predicate-highlight": {
              backgroundColor: "rgba(37, 99, 235, 0.18)",
              borderRadius: "2px",
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

  return <div ref={containerRef} class="editor-container" />;
}
