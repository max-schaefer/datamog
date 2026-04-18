import type { Example } from "../examples/index.ts";
import type { BackendName } from "../worker/bridge.ts";

interface ToolbarProps {
  onRun: () => void;
  onToggleSql: () => void;
  showSql: boolean;
  isRunning: boolean;
  ready: boolean;
  canRun: boolean;
  backend: BackendName;
  onBackendChange: (backend: BackendName) => void;
  examples: Example[];
  onLoadExample: (index: number) => void;
}

const BACKEND_OPTIONS: { value: BackendName; label: string }[] = [
  { value: "sqlite", label: "SQLite (runs in browser)" },
  { value: "postgres", label: "PostgreSQL (SQL only)" },
  { value: "duckdb", label: "DuckDB (SQL only)" },
];

export function Toolbar({
  onRun,
  onToggleSql,
  showSql,
  isRunning,
  ready,
  canRun,
  backend,
  onBackendChange,
  examples,
  onLoadExample,
}: ToolbarProps) {
  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <img src={`${import.meta.env.BASE_URL}datamog.jpg`} alt="Datamog" class="toolbar-logo" />
        <span class="toolbar-title">Datamog Playground</span>
        <select
          class="example-select"
          onChange={(e) => {
            const idx = (e.target as HTMLSelectElement).selectedIndex - 1;
            if (idx >= 0) onLoadExample(idx);
            (e.target as HTMLSelectElement).selectedIndex = 0;
          }}
        >
          <option>Load example...</option>
          {examples.map((ex, i) => (
            <option key={i} value={i}>
              {ex.name} — {ex.description}
            </option>
          ))}
        </select>
      </div>
      <div class="toolbar-right">
        <select
          class="backend-select"
          value={backend}
          title="Select a SQL backend. Only SQLite executes in the browser; other backends show the generated SQL only."
          onChange={(e) => onBackendChange((e.target as HTMLSelectElement).value as BackendName)}
        >
          {BACKEND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button class="btn btn-secondary" onClick={onToggleSql} disabled={!ready}>
          {showSql ? "Hide SQL" : "Show SQL"}
        </button>
        <button
          class="btn btn-primary"
          onClick={onRun}
          disabled={isRunning || !ready || !canRun}
          title={canRun ? undefined : "This backend does not run in the browser"}
        >
          {isRunning ? "Running..." : "Run"}
          {ready && !isRunning && canRun && <span class="shortcut">Ctrl+Enter</span>}
        </button>
      </div>
    </div>
  );
}
