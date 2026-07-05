import type { SqlSpan, TranslationResult } from "datamog-engine";
import type { SourceSpan } from "../worker/bridge.ts";
import { SqlBlock } from "./sql-block.tsx";

interface SqlPreviewProps {
  result: TranslationResult;
  hoveredRange: SourceSpan | null;
  onHoverRange: (range: SourceSpan | null) => void;
}

interface Section {
  title: string;
  statements: string[];
  predicates: (string | null)[];
  spanMaps: (SqlSpan[] | null)[];
}

export function SqlPreview({ result, hoveredRange, onHoverRange }: SqlPreviewProps) {
  const sections: Section[] = [
    {
      title: "Tables",
      statements: result.createTables,
      predicates: result.createTables.map(() => null),
      spanMaps: result.createTables.map(() => null),
    },
    {
      title: "Views",
      statements: result.createViews,
      predicates: result.viewPredicates ?? result.createViews.map(() => null),
      spanMaps: result.viewSpans ?? result.createViews.map(() => null),
    },
    {
      title: "Queries",
      statements: result.queries,
      predicates: result.queryPredicates ?? result.queries.map(() => null),
      spanMaps: result.querySpans ?? result.queries.map(() => null),
    },
  ].filter((s) => s.statements.length > 0);

  if (sections.length === 0) {
    return <div class="placeholder">No SQL generated</div>;
  }

  return (
    <div class="sql-preview">
      {sections.map((section) => (
        <div key={section.title} class="sql-section">
          <div class="sql-section-title">{section.title}</div>
          {section.statements.map((stmt, i) => {
            const predicate = section.predicates[i] ?? null;
            const spans = section.spanMaps[i] ?? null;
            return (
              <div key={`${i}:${predicate ?? stmt}`} class="sql-block-wrapper">
                {predicate && (
                  <div
                    class="sql-block-label"
                    title="Hover the SQL to highlight the matching Datalog"
                  >
                    <code>{predicate}</code>
                  </div>
                )}
                <SqlBlock
                  value={stmt}
                  spans={spans}
                  hoveredRange={hoveredRange}
                  onHoverRange={onHoverRange}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
