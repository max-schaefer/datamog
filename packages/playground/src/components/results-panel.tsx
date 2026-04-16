import type { QueryResult } from "datamog-engine";

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
        <div key={i} class="result-block">
          <div class="result-query">{result.source ?? result.sql}</div>
          {result.rows.length === 0 ? (
            <div class="result-empty">(no rows)</div>
          ) : (
            <table class="result-table">
              <thead>
                <tr>
                  {Object.keys(result.rows[0]!).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, j) => (
                  <tr key={j}>
                    {Object.values(row).map((val, k) => (
                      <td key={k}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
