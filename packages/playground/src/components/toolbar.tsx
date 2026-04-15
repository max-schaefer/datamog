import type { Example } from "../examples/index.ts";

interface ToolbarProps {
  onRun: () => void;
  onToggleSql: () => void;
  showSql: boolean;
  isRunning: boolean;
  ready: boolean;
  examples: Example[];
  onLoadExample: (index: number) => void;
}

export function Toolbar({
  onRun,
  onToggleSql,
  showSql,
  isRunning,
  ready,
  examples,
  onLoadExample,
}: ToolbarProps) {
  return (
    <div class="toolbar">
      <div class="toolbar-left">
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
        <button class="btn btn-secondary" onClick={onToggleSql} disabled={!ready}>
          {showSql ? "Hide SQL" : "Show SQL"}
        </button>
        <button class="btn btn-primary" onClick={onRun} disabled={isRunning || !ready}>
          {isRunning ? "Running..." : "Run"}
          {ready && !isRunning && <span class="shortcut">Ctrl+Enter</span>}
        </button>
      </div>
    </div>
  );
}
