import type { TranslationResult } from "datamog-engine";
import { SqlBlock } from "./sql-block.tsx";

interface SqlPreviewProps {
  result: TranslationResult;
  hoveredPredicate: string | null;
  onHoverPredicate: (predicate: string | null) => void;
}

interface Section {
  title: string;
  statements: string[];
  predicates: (string | null)[];
}

export function SqlPreview({ result, hoveredPredicate, onHoverPredicate }: SqlPreviewProps) {
  const sections: Section[] = [
    {
      title: "Tables",
      statements: result.createTables,
      predicates: result.createTables.map(() => null),
    },
    {
      title: "Views",
      statements: result.createViews,
      predicates: result.viewPredicates ?? result.createViews.map(() => null),
    },
    {
      title: "Queries",
      statements: result.queries,
      predicates: result.queryPredicates ?? result.queries.map(() => null),
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
            const highlighted = predicate !== null && predicate === hoveredPredicate;
            return (
              <div
                key={i}
                class={`sql-block-wrapper${highlighted ? " highlighted" : ""}`}
                onMouseEnter={() => predicate && onHoverPredicate(predicate)}
                onMouseLeave={() => onHoverPredicate(null)}
              >
                {predicate && (
                  <div
                    class="sql-block-label"
                    title="Hover to highlight the matching Datalog rules"
                  >
                    <code>{predicate}</code>
                  </div>
                )}
                <SqlBlock value={stmt} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
