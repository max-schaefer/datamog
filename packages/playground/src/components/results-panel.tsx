import { useState } from "preact/hooks";
import type { QueryResult } from "datamog-engine";
import { MermaidView } from "./mermaid-view.tsx";

type Format = "table" | "mermaid" | "json";

interface ResultsPanelProps {
  results: QueryResult[];
}

export function ResultsPanel({ results }: ResultsPanelProps) {
  if (results.length === 0) {
    return <div class="placeholder">No queries in program</div>;
  }

  return (
    <div class="results-panel">
      {results.map((result, i) => (
        <ResultBlock key={i} result={result} />
      ))}
    </div>
  );
}

function ResultBlock({ result }: { result: QueryResult }) {
  const [format, setFormat] = useState<Format>("table");
  const arity = result.rows.length > 0 ? Object.keys(result.rows[0]!).length : 0;
  const mermaidAvailable = arity >= 2;

  return (
    <div class="result-block">
      <div class="result-header">
        <div class="result-query">{result.source ?? result.sql}</div>
        <FormatToggle value={format} onChange={setFormat} mermaidAvailable={mermaidAvailable} />
      </div>
      {result.rows.length === 0 ? (
        <div class="result-empty">(no rows)</div>
      ) : format === "table" ? (
        <TableView rows={result.rows} />
      ) : format === "mermaid" ? (
        <MermaidView rows={result.rows} />
      ) : (
        <JsonView rows={result.rows} />
      )}
    </div>
  );
}

function FormatToggle({
  value,
  onChange,
  mermaidAvailable,
}: {
  value: Format;
  onChange: (f: Format) => void;
  mermaidAvailable: boolean;
}) {
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

function TableView({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table class="result-table">
      <thead>
        <tr>
          {Object.keys(rows[0]!).map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, j) => (
          <tr key={j}>
            {Object.values(row).map((val, k) => (
              <td key={k}>{String(val)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function JsonView({ rows }: { rows: Record<string, unknown>[] }) {
  return <pre class="result-json">{JSON.stringify(rows, null, 2)}</pre>;
}
