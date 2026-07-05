import { type QueryResult, bigintSafeReplacer } from "datamog-engine";
import { useState } from "preact/hooks";
import { formatCell } from "../lib/format-cell.ts";
import { type Format, FormatToggle, JsonView } from "./format-toggle.tsx";
import { MermaidView } from "./mermaid-view.tsx";

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
        <ResultBlock key={`${i}:${result.source ?? result.sql}`} result={result} />
      ))}
    </div>
  );
}

function ResultBlock({ result }: { result: QueryResult }) {
  const [format, setFormat] = useState<Format>("table");
  const arity = result.rows.length > 0 ? Object.keys(result.rows[0]!).length : 0;
  const mermaidAvailable = arity >= 2;

  // A ground query (no projected variables) collapses to either zero
  // rows (`no` — nothing satisfies the body) or a single empty-record
  // row (`yes` — at least one binding satisfies). We surface those
  // as the textual answers across every view format, matching the CLI.
  const isYes = result.rows.length === 1 && arity === 0;
  const isNo = result.rows.length === 0;

  return (
    <div class="result-block">
      <div class="result-header">
        <div class="result-query">{result.source ?? result.sql}</div>
        <FormatToggle value={format} onChange={setFormat} mermaidAvailable={mermaidAvailable} />
      </div>
      {isNo ? (
        <div class="result-empty">no</div>
      ) : isYes ? (
        <div class="result-yes">yes</div>
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
        {rows.map((row) => (
          <tr key={JSON.stringify(row, bigintSafeReplacer)}>
            {Object.entries(row).map(([col, val]) => (
              <td key={col}>{formatCell(val)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
