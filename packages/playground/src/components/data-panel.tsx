import { expandGitHubShorthand } from "datamog-engine";

export type DataFormat = "csv" | "jsonl" | "csv-url";

interface ExtDecl {
  predicate: string;
  columns: string;
}

interface DataPanelProps {
  extensionals: ExtDecl[];
  csvData: Record<string, string>;
  jsonlData: Record<string, string>;
  csvUrlData: Record<string, string>;
  onChange: (
    csvData: Record<string, string>,
    jsonlData: Record<string, string>,
    csvUrlData: Record<string, string>,
  ) => void;
}

/**
 * Pick the source to display for a given predicate. We default to CSV —
 * historically the only supported format — but switch to JSONL whenever
 * the user (or the example loader) populated the JSONL textarea but not
 * the CSV one, and to CSV URL when an example points at remote data. A
 * predicate is never shown in multiple source modes at once: the worker's
 * loader chain would happily resolve any of them, but presenting multiple
 * editable sources would be ambiguous about which one feeds the run.
 */
function inferFormat(
  predicate: string,
  csvData: Record<string, string>,
  jsonlData: Record<string, string>,
  csvUrlData: Record<string, string>,
): DataFormat {
  if (
    csvUrlData[predicate] !== undefined &&
    csvData[predicate] === undefined &&
    jsonlData[predicate] === undefined
  ) {
    return "csv-url";
  }
  if (jsonlData[predicate] !== undefined && csvData[predicate] === undefined) return "jsonl";
  return "csv";
}

function valueFor(
  format: DataFormat,
  predicate: string,
  csvData: Record<string, string>,
  jsonlData: Record<string, string>,
  csvUrlData: Record<string, string>,
  columnsSource: string,
): string {
  switch (format) {
    case "csv":
      // Seed an untouched CSV textarea with a header row of the
      // declared column names. The seed is display-only — it lives
      // in the rendered `value` but not in `csvData` — so format
      // switches don't silently carry it over, and only becomes a
      // real buffered value once the user types something.
      return csvData[predicate] ?? defaultCsvHeader(columnsSource);
    case "jsonl":
      return jsonlData[predicate] ?? "";
    case "csv-url":
      return csvUrlData[predicate] ?? "";
  }
}

/**
 * Build the first-line CSV header for an extensional's textarea from
 * the column-list source the regex in `app.tsx` extracted from the
 * declaration — a raw `name: type, name: type?, ...` string. We take
 * each comma-separated chunk, drop everything from the first colon
 * on, trim, and strip a surrounding pair of backticks if the column
 * name was quoted. Best-effort: a declaration with backtick-quoted
 * names containing literal commas would confuse this and the
 * regex-based extractor in app.tsx alike.
 */
function defaultCsvHeader(columnsSource: string): string {
  const names = columnsSource.split(",").map((chunk) => {
    const colon = chunk.indexOf(":");
    const namePart = colon === -1 ? chunk : chunk.slice(0, colon);
    const trimmed = namePart.trim();
    return trimmed.startsWith("`") && trimmed.endsWith("`") ? trimmed.slice(1, -1) : trimmed;
  });
  return `${names.join(",")}\n`;
}

function httpUrlHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    // Resolve the `gh:`/`github:` shorthand so the open-in-new-tab link
    // points at the real raw URL rather than the unparseable `gh:` form.
    const url = new URL(expandGitHubShorthand(trimmed));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const OpenUrlIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
  </svg>
);

export function DataPanel({
  extensionals,
  csvData,
  jsonlData,
  csvUrlData,
  onChange,
}: DataPanelProps) {
  return (
    <div class="data-panel">
      <div class="data-panel-header">Data</div>
      {extensionals.map((ext) => {
        const inputId = `data-entry-${ext.predicate}`;
        const format = inferFormat(ext.predicate, csvData, jsonlData, csvUrlData);
        const value = valueFor(format, ext.predicate, csvData, jsonlData, csvUrlData, ext.columns);
        const href = format === "csv-url" ? httpUrlHref(value) : null;
        const placeholder =
          format === "csv-url"
            ? `https://example.com/${ext.predicate}.csv`
            : format === "csv"
              ? `Paste CSV data for ${ext.predicate}...`
              : `Paste JSONL data for ${ext.predicate}...`;
        return (
          <div key={ext.predicate} class="data-entry">
            <div class="data-entry-header">
              <label htmlFor={inputId}>
                <code>
                  {ext.predicate}({ext.columns})
                </code>
              </label>
              <select
                class="data-format-select"
                aria-label={`Data format for ${ext.predicate}`}
                value={format}
                onChange={(e) => {
                  const next = e.currentTarget.value as DataFormat;
                  if (next === format) return;
                  // Move the existing buffer into the chosen format's
                  // map and clear the other side, so the loader chain
                  // sees exactly one source per predicate. We read
                  // the raw map (not the displayed `value`) so the
                  // CSV header seed doesn't leak into JSONL when the
                  // user switches without typing anything.
                  const rawBuffer =
                    csvData[ext.predicate] ??
                    jsonlData[ext.predicate] ??
                    csvUrlData[ext.predicate] ??
                    "";
                  const carry = format === "csv-url" || next === "csv-url" ? "" : rawBuffer;
                  const nextCsv = { ...csvData };
                  const nextJsonl = { ...jsonlData };
                  const nextCsvUrl = { ...csvUrlData };
                  delete nextCsv[ext.predicate];
                  delete nextJsonl[ext.predicate];
                  delete nextCsvUrl[ext.predicate];
                  if (next === "csv") nextCsv[ext.predicate] = carry;
                  else if (next === "jsonl") nextJsonl[ext.predicate] = carry;
                  else nextCsvUrl[ext.predicate] = carry;
                  onChange(nextCsv, nextJsonl, nextCsvUrl);
                }}
              >
                <option value="csv">CSV</option>
                <option value="jsonl">JSONL</option>
                <option value="csv-url">CSV URL</option>
              </select>
            </div>
            {format === "csv-url" ? (
              <div class="data-url-row">
                <input
                  id={inputId}
                  class="data-url-input"
                  type="url"
                  value={value}
                  placeholder={placeholder}
                  onInput={(e) => {
                    onChange(csvData, jsonlData, {
                      ...csvUrlData,
                      [ext.predicate]: e.currentTarget.value,
                    });
                  }}
                />
                {href ? (
                  <a
                    class="data-url-open-button"
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`Open ${ext.predicate} CSV URL`}
                    aria-label={`Open ${ext.predicate} CSV URL`}
                  >
                    <OpenUrlIcon />
                  </a>
                ) : (
                  <button
                    type="button"
                    class="data-url-open-button"
                    title={`Open ${ext.predicate} CSV URL`}
                    aria-label={`Open ${ext.predicate} CSV URL`}
                    disabled
                  >
                    <OpenUrlIcon />
                  </button>
                )}
              </div>
            ) : (
              <textarea
                id={inputId}
                class="data-textarea"
                value={value}
                placeholder={placeholder}
                onInput={(e) => {
                  const text = e.currentTarget.value;
                  if (format === "csv") {
                    onChange({ ...csvData, [ext.predicate]: text }, jsonlData, csvUrlData);
                  } else {
                    onChange(csvData, { ...jsonlData, [ext.predicate]: text }, csvUrlData);
                  }
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
