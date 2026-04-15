interface ExtDecl {
  predicate: string;
  columns: string;
}

interface DataPanelProps {
  extensionals: ExtDecl[];
  csvData: Record<string, string>;
  onChange: (csvData: Record<string, string>) => void;
}

export function DataPanel({ extensionals, csvData, onChange }: DataPanelProps) {
  return (
    <div class="data-panel">
      <div class="data-panel-header">Data (CSV)</div>
      {extensionals.map((ext) => (
        <div key={ext.predicate} class="data-entry">
          <label>
            <code>
              {ext.predicate}({ext.columns})
            </code>
          </label>
          <textarea
            class="data-textarea"
            value={csvData[ext.predicate] ?? ""}
            placeholder={`Paste CSV data for ${ext.predicate}...`}
            onInput={(e) => {
              onChange({
                ...csvData,
                [ext.predicate]: (e.target as HTMLTextAreaElement).value,
              });
            }}
          />
        </div>
      ))}
    </div>
  );
}
