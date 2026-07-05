// Shared "Table / Mermaid / JSON" format toggle. Used by the query-results
// panel and by each relation in the step view. Kept in one place so the
// button group renders identically wherever it appears.

import { bigintSafeReplacer } from "datamog-engine";

export type Format = "table" | "mermaid" | "json";

interface FormatToggleProps {
  value: Format;
  onChange: (f: Format) => void;
  mermaidAvailable: boolean;
}

export function FormatToggle({ value, onChange, mermaidAvailable }: FormatToggleProps) {
  const options: { id: Format; label: string; disabled?: boolean; title?: string }[] = [
    { id: "table", label: "Table" },
    {
      id: "mermaid",
      label: "Mermaid",
      disabled: !mermaidAvailable,
      title: mermaidAvailable ? undefined : "Needs at least two columns (source, dest)",
    },
    { id: "json", label: "JSON" },
  ];
  return (
    <div class="format-toggle">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          class={`format-toggle-btn${value === opt.id ? " active" : ""}`}
          onClick={() => onChange(opt.id)}
          disabled={opt.disabled}
          title={opt.title}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function JsonView({ rows }: { rows: Record<string, unknown>[] }) {
  // `bigintSafeReplacer` survives BigInt cells — Postgres BIGINT columns
  // arrive as JS `BigInt` via `Bun.sql`, and bare `JSON.stringify`
  // throws `cannot serialize BigInt` outright.
  return <pre class="result-json">{JSON.stringify(rows, bigintSafeReplacer, 2)}</pre>;
}
