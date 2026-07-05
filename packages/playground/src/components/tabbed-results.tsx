// Output panel with two tabs:
//   - Results: query results from the most recent Run.
//   - Second tab:
//       * Step backends (native/seminaive) → "Steps": step-through view of
//         the run's trace.
//       * SQL backends                     → "SQL": generated SQL (fetched
//         lazily on demand).
//
// The component is a pure renderer; its parent owns the result state plus
// the on-demand SQL fetch. That keeps worker plumbing in one place and lets
// the sticky editor hover-highlight continue flowing through app-level
// state.

import type { QueryResult } from "datamog-engine";
import { useEffect } from "preact/hooks";
import type { BackendName, DryRunResult, SourceSpan, StepResult } from "../worker/bridge.ts";
import { ResultsPanel } from "./results-panel.tsx";
import { SqlPreview } from "./sql-preview.tsx";
import { StepPanel } from "./step-panel.tsx";

export type ResultsTab = "results" | "internals";

interface Props {
  backend: BackendName;
  activeTab: ResultsTab;
  onActiveTabChange: (tab: ResultsTab) => void;

  results: QueryResult[] | null;
  stepResult: StepResult | null;
  sqlResult: DryRunResult | null;

  hoveredRange: SourceSpan | null;
  onHoverRange: (range: SourceSpan | null) => void;

  /** Called when the "Internals" tab is activated and SQL isn't cached. */
  onRequestSql: () => void;
}

function isStepBackend(backend: BackendName): boolean {
  return backend === "native" || backend === "seminaive";
}

export function TabbedResults({
  backend,
  activeTab,
  onActiveTabChange,
  results,
  stepResult,
  sqlResult,
  hoveredRange,
  onHoverRange,
  onRequestSql,
}: Props) {
  const isStep = isStepBackend(backend);
  const internalsLabel = isStep ? "Steps" : "SQL";

  // Lazily fetch SQL when the SQL tab becomes active for a SQL backend.
  useEffect(() => {
    if (activeTab === "internals" && !isStep && !sqlResult) {
      onRequestSql();
    }
  }, [activeTab, isStep, sqlResult, onRequestSql]);

  return (
    <div class="tabbed-results">
      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "results"}
          class={`tab ${activeTab === "results" ? "active" : ""}`}
          onClick={() => onActiveTabChange("results")}
        >
          Results
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "internals"}
          class={`tab ${activeTab === "internals" ? "active" : ""}`}
          onClick={() => onActiveTabChange("internals")}
        >
          {internalsLabel}
        </button>
      </div>
      <div class="tab-panel">
        {activeTab === "results"
          ? renderResultsTab(results, isStep)
          : renderInternalsTab({
              backend,
              isStep,
              stepResult,
              sqlResult,
              hoveredRange,
              onHoverRange,
            })}
      </div>
    </div>
  );
}

function renderResultsTab(results: QueryResult[] | null, isStep: boolean) {
  if (results) return <ResultsPanel results={results} />;
  return (
    <div class="tab-placeholder">
      {isStep ? "Press Run to evaluate the program and produce results." : "Press Run to execute."}
    </div>
  );
}

function renderInternalsTab({
  backend,
  isStep,
  stepResult,
  sqlResult,
  hoveredRange,
  onHoverRange,
}: {
  backend: BackendName;
  isStep: boolean;
  stepResult: StepResult | null;
  sqlResult: DryRunResult | null;
  hoveredRange: SourceSpan | null;
  onHoverRange: (range: SourceSpan | null) => void;
}) {
  if (isStep) {
    if (!stepResult) {
      const evaluatorName = backend === "seminaive" ? "seminaive" : "naive";
      return (
        <div class="tab-placeholder">
          Press Run to generate a stepping trace with the {evaluatorName} interpreter.
        </div>
      );
    }
    return <StepPanel result={stepResult} onHoverRange={onHoverRange} />;
  }
  if (!sqlResult) {
    return <div class="tab-placeholder">Generating SQL…</div>;
  }
  return (
    <SqlPreview result={sqlResult.result} hoveredRange={hoveredRange} onHoverRange={onHoverRange} />
  );
}
