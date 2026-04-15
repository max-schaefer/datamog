import { useEffect, useRef } from "preact/hooks";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { sql, SQLite } from "@codemirror/lang-sql";

interface SqlBlockProps {
  value: string;
}

export function SqlBlock({ value }: SqlBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          sql({ dialect: SQLite }),
          syntaxHighlighting(defaultHighlightStyle),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.theme({
            "&": {
              backgroundColor: "#f9fafb",
              fontSize: "13px",
            },
            ".cm-gutters": { display: "none" },
            ".cm-content": { padding: "12px" },
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-scroller": {
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              lineHeight: "1.5",
            },
            ".cm-cursor": { display: "none" },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
  }, [value]);

  return <div ref={containerRef} class="sql-block" />;
}
