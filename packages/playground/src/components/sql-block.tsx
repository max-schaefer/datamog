import { SQLite, sql } from "@codemirror/lang-sql";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import type { SqlSpan } from "datamog-engine";
import { useEffect, useRef } from "preact/hooks";
import type { SourceSpan } from "../worker/bridge.ts";

interface SqlBlockProps {
  value: string;
  spans: SqlSpan[] | null;
  hoveredRange: SourceSpan | null;
  onHoverRange: (range: SourceSpan | null) => void;
}

const highlightMark = Decoration.mark({ class: "cm-sql-highlight" });
const setHighlightRange = StateEffect.define<SourceSpan | null>();
const setSpansEffect = StateEffect.define<SqlSpan[] | null>();

interface HighlightState {
  decorations: DecorationSet;
  spans: SqlSpan[] | null;
}

function computeDecorations(
  spans: SqlSpan[] | null,
  range: SourceSpan | null,
  docLen: number,
): DecorationSet {
  if (!spans || !range) return Decoration.none;
  const marks = [];
  for (const s of spans) {
    if (s.astStart === range.start && s.astEnd === range.end) {
      const to = Math.min(s.sqlEnd, docLen);
      if (s.sqlStart < to) marks.push(highlightMark.range(s.sqlStart, to));
    }
  }
  return Decoration.set(marks, true);
}

const highlightField = StateField.define<HighlightState>({
  create() {
    return { decorations: Decoration.none, spans: null };
  },
  update(value, tr) {
    let decorations = value.decorations.map(tr.changes);
    let spans = value.spans;
    let range: SourceSpan | null | undefined;
    for (const effect of tr.effects) {
      if (effect.is(setSpansEffect)) {
        spans = effect.value;
        if (range === undefined) {
          decorations = Decoration.none;
        }
      }
      if (effect.is(setHighlightRange)) {
        range = effect.value;
      }
    }
    if (range !== undefined) {
      decorations = computeDecorations(spans, range, tr.state.doc.length);
    }
    return { decorations, spans };
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

function rangesEqual(a: SourceSpan | null, b: SourceSpan | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

export function SqlBlock({ value, spans, hoveredRange, onHoverRange }: SqlBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const spansRef = useRef(spans);
  const onHoverRef = useRef(onHoverRange);
  spansRef.current = spans;
  onHoverRef.current = onHoverRange;

  // Rebuild when the SQL text changes. Span/hover state is passed in via
  // refs and dispatched through the StateField so we don't tear down the
  // editor on every hover.
  // biome-ignore lint/correctness/useExhaustiveDependencies: span/hover state handled via effects
  useEffect(() => {
    if (!containerRef.current) return;

    const hoverPlugin = ViewPlugin.fromClass(
      class {
        private last: SourceSpan | null = null;
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
          const ss = spansRef.current;
          if (!ss) {
            this.setRange(null);
            return;
          }
          const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos === null) {
            this.setRange(null);
            return;
          }
          // Pick the innermost span (smallest SQL range) covering pos.
          let bestWidth = Number.POSITIVE_INFINITY;
          let best: SourceSpan | null = null;
          for (const s of ss) {
            if (pos < s.sqlStart || pos >= s.sqlEnd) continue;
            const w = s.sqlEnd - s.sqlStart;
            if (w < bestWidth) {
              bestWidth = w;
              best = { start: s.astStart, end: s.astEnd };
            }
          }
          this.setRange(best);
        }

        private handleLeave() {
          this.setRange(null);
        }

        private setRange(r: SourceSpan | null) {
          if (rangesEqual(r, this.last)) return;
          this.last = r;
          onHoverRef.current(r);
        }
      },
    );

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          sql({ dialect: SQLite }),
          syntaxHighlighting(classHighlighter),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          highlightField,
          hoverPlugin,
          EditorView.theme({
            "&": {
              backgroundColor: "var(--surface-muted)",
              color: "var(--text)",
              fontSize: "13px",
            },
            ".cm-gutters": { display: "none" },
            ".cm-content": { padding: "12px 14px" },
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-scroller": {
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
              lineHeight: "1.55",
            },
            ".cm-cursor": { display: "none" },
            ".cm-sql-highlight": {
              backgroundColor: "var(--primary-soft)",
              borderRadius: "3px",
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.dispatch({
      effects: [setSpansEffect.of(spans ?? null), setHighlightRange.of(hoveredRange)],
    });
    return () => view.destroy();
  }, [value]);

  // Push span list changes into the editor without rebuilding it.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setSpansEffect.of(spans ?? null) });
  }, [spans]);

  // Push hover-range changes into the editor without rebuilding it.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setHighlightRange.of(hoveredRange) });
  }, [hoveredRange]);

  return <div ref={containerRef} class="sql-block" />;
}
