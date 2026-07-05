import { type EmbedConfig, type PredData, embedAffordances } from "./affordances.ts";
import { createEmbedEditor } from "./editor.ts";
import type { EmbedEngine } from "./engine.ts";
import "./embed.css";

interface Payload {
  /** The Datamog program source. */
  source: string;
  /** CSV text per extensional predicate. */
  csv?: Record<string, string>;
  /** JSONL text per extensional predicate. */
  jsonl?: Record<string, string>;
  /** Interpreter to evaluate with (default `native`). */
  engine?: EmbedEngine;
}

/**
 * Read a host element's payload. Preferred form is a child
 * `<script type="application/json">` (robust against HTML escaping); a bare
 * element with text content is treated as a program with no data.
 */
function readPayload(el: HTMLElement): Payload {
  const script = el.querySelector('script[type="application/json"]');
  if (script?.textContent) {
    return JSON.parse(script.textContent) as Payload;
  }
  return { source: (el.textContent ?? "").trim() };
}

/** Build the per-predicate data record from a payload's csv/jsonl maps. */
function dataFromPayload(payload: Payload): Record<string, PredData> {
  const data: Record<string, PredData> = {};
  for (const [pred, text] of Object.entries(payload.csv ?? {})) {
    data[pred] = { format: "csv", text };
  }
  for (const [pred, text] of Object.entries(payload.jsonl ?? {})) {
    data[pred] = { format: "jsonl", text };
  }
  return data;
}

/** Mount every `[data-datamog]` element under `root` (idempotent per element). */
export function mountAll(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-datamog]")) {
    mount(el);
  }
}

function mount(el: HTMLElement): void {
  if (el.dataset.datamogMounted) return;
  el.dataset.datamogMounted = "1";

  const payload = readPayload(el);
  const data = dataFromPayload(payload);
  // `initialData` is the editable working copy; `defaults` (same source, copied
  // independently inside the data field) backs the popover's Reset action.
  const config: EmbedConfig = {
    engine: payload.engine ?? "native",
    initialData: data,
    defaults: data,
  };

  el.textContent = "";
  el.classList.add("datamog-embed");
  const editorHost = el.appendChild(document.createElement("div"));
  editorHost.className = "datamog-embed-editor";
  createEmbedEditor(editorHost, payload.source, embedAffordances(config));
}
