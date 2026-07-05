import type { QueryResult } from "datamog-engine";
import { formatCell } from "../lib/format-cell.ts";

/**
 * Render one query result to a DOM node: a table for tuple results, or the
 * textual `yes` / `no` answer for a ground query (no projected variables).
 */
export function renderQueryResult(result: QueryResult): HTMLElement {
  const arity = result.rows.length > 0 ? Object.keys(result.rows[0]!).length : 0;
  if (result.rows.length === 0) return answer("no");
  if (arity === 0) return answer("yes");
  return buildTable(result.rows);
}

/** Render a run failure (parse/analyse/eval error) as an error block. */
export function renderRunError(message: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "datamog-embed-error";
  div.textContent = message;
  return div;
}

function answer(text: "yes" | "no"): HTMLElement {
  const div = document.createElement("div");
  div.className = `datamog-embed-answer datamog-embed-answer-${text}`;
  div.textContent = text;
  return div;
}

function buildTable(rows: Record<string, unknown>[]): HTMLTableElement {
  const cols = Object.keys(rows[0]!);
  const table = document.createElement("table");
  table.className = "datamog-embed-table";

  const headRow = table.createTHead().insertRow();
  for (const col of cols) {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  }

  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const col of cols) {
      tr.insertCell().textContent = formatCell(row[col]);
    }
  }
  return table;
}
