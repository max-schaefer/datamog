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
import type { SourceSpan } from "../worker/bridge.ts";

interface EditorProps {
  source: string;
  onChange: (source: string) => void;
  spans: Record<string, SourceSpan[]> | null;
  hoveredPredicate: string | null;
  onHoverPredicate: (predicate: string | null) => void;
}

// Highlight decoration applied to rule/query ranges whose predicate matches
// the currently hovered SQL view.
const highlightMark = Decoration.mark({ class: "cm-predicate-highlight" });

const setHighlightSpans = StateEffect.define<SourceSpan[]>();

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHighlightSpans)) {
        const docLen = tr.state.doc.length;
        const ranges = effect.value
          .filter((s) => s.start < s.end && s.end <= docLen)
          .map((s) => highlightMark.range(s.start, s.end));
        next = Decoration.set(ranges, true);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function Editor({
  source,
  onChange,
  spans,
  hoveredPredicate,
  onHoverPredicate,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const spansRef = useRef(spans);
  const onHoverRef = useRef(onHoverPredicate);
  onChangeRef.current = onChange;
  spansRef.current = spans;
  onHoverRef.current = onHoverPredicate;

  // Create editor once: the EditorView is created with the initial `source`
  // and thereafter synced via the separate effect below. Listing `source` in
  // the deps would recreate the editor on every keystroke.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial-only effect, see comment above
  useEffect(() => {
    if (!containerRef.current) return;

    const hoverPlugin = ViewPlugin.fromClass(
      class {
        private lastPredicate: string | null = null;
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
          const spans = spansRef.current;
          if (pos === null || !spans) {
            this.setPredicate(null);
            return;
          }
          let found: string | null = null;
          for (const [predicate, ranges] of Object.entries(spans)) {
            if (ranges.some((r) => pos >= r.start && pos < r.end)) {
              found = predicate;
              break;
            }
          }
          this.setPredicate(found);
        }

        private handleLeave() {
          this.setPredicate(null);
        }

        private setPredicate(p: string | null) {
          if (p === this.lastPredicate) return;
          this.lastPredicate = p;
          onHoverRef.current(p);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once
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

  // Update highlight decorations when the hovered predicate changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ranges: SourceSpan[] = hoveredPredicate && spans ? (spans[hoveredPredicate] ?? []) : [];
    view.dispatch({ effects: setHighlightSpans.of(ranges) });
  }, [hoveredPredicate, spans]);

  return <div ref={containerRef} class="editor-container" />;
}
