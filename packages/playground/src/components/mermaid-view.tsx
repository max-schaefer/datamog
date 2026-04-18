import { useEffect, useRef, useState } from "preact/hooks";

interface MermaidViewProps {
  rows: Record<string, unknown>[];
}

// Lazy singleton: load the mermaid bundle on first use, not at app startup.
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const api = m.default;
      api.initialize({ startOnLoad: false, securityLevel: "loose", theme: "default" });
      return api;
    });
  }
  return mermaidPromise;
}

function mermaidEscape(id: string): string {
  if (/^[\w][\w.-]*$/.test(id)) return id;
  const safeId = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${safeId}["${id.replace(/"/g, "#quot;")}"]`;
}

function rowsToMermaid(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "graph TD\n";
  const keys = Object.keys(rows[0]!);
  const lines = ["graph TD"];
  for (const row of rows) {
    const src = String(row[keys[0]!] ?? "");
    const dst = String(row[keys[1]!] ?? "");
    const label = keys.length >= 3 ? String(row[keys[2]!] ?? "") : "";
    const arrow = label ? `-- ${label.replace(/[|]/g, " ")} -->` : "-->";
    lines.push(`    ${mermaidEscape(src)} ${arrow} ${mermaidEscape(dst)}`);
  }
  return lines.join("\n");
}

let diagramSeq = 0;

export function MermaidView({ rows }: MermaidViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const source = rowsToMermaid(rows);
    const id = `mermaid-${++diagramSeq}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, source))
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
  }, [rows]);

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
