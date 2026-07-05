import { rowsToMermaid } from "datamog-engine";
import { useEffect, useRef, useState } from "preact/hooks";
import { lazyAsync } from "../lib/lazy.ts";
import { type Theme, getCurrentTheme, subscribeTheme } from "../lib/theme.ts";

interface MermaidViewProps {
  rows: Record<string, unknown>[];
}

// Lazy singleton: load the mermaid bundle on first use, not at app
// startup. `lazyAsync` clears the cache on rejection so a transient
// module-load failure doesn't permanently break the diagram.
const loadMermaid = lazyAsync(() => import("mermaid").then((m) => m.default));

let diagramSeq = 0;

export function MermaidView({ rows }: MermaidViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => subscribeTheme(setTheme), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const source = rowsToMermaid(rows);
    const id = `mermaid-${++diagramSeq}`;
    loadMermaid()
      .then((mermaid) => {
        // initialize is idempotent; call it each render so theme changes
        // applied by a sibling component take effect for newly-rendered
        // diagrams without rebuilding the mermaid bundle.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: theme === "dark" ? "dark" : "default",
        });
        return mermaid.render(id, source);
      })
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        bindFunctions?.(ref.current);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [rows, theme]);

  if (rows.length > 0 && Object.keys(rows[0]!).length < 2) {
    return <div class="placeholder">Mermaid view needs at least two columns (source, dest).</div>;
  }

  return (
    <div class="mermaid-view">
      {error ? <div class="error-box">Failed to render diagram: {error}</div> : null}
      <div ref={ref} class="mermaid-container" />
    </div>
  );
}
