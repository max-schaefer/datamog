import type { TranslationResult } from "datamog-engine";
import { SqlBlock } from "./sql-block.tsx";

interface SqlPreviewProps {
  result: TranslationResult;
}

export function SqlPreview({ result }: SqlPreviewProps) {
  const sections = [
    { title: "Tables", statements: result.createTables },
    { title: "Views", statements: result.createViews },
    { title: "Queries", statements: result.queries },
  ].filter((s) => s.statements.length > 0);

  if (sections.length === 0) {
    return <div class="placeholder">No SQL generated</div>;
  }

  return (
    <div class="sql-preview">
      {sections.map((section) => (
        <div key={section.title} class="sql-section">
          <div class="sql-section-title">{section.title}</div>
          {section.statements.map((stmt, i) => (
            <SqlBlock key={i} value={stmt} />
          ))}
        </div>
      ))}
    </div>
  );
}
