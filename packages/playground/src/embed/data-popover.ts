import type { PredData } from "./affordances.ts";

export interface DataPopoverOptions {
  /** Element to anchor the popover near (the clicked chip). */
  anchor: HTMLElement;
  predicate: string;
  /** Declared column names, shown as a hint. */
  columns: string[];
  /** Current data for the predicate, or undefined if none is set. */
  initial: PredData | undefined;
  /** Whether a pre-baked default exists (enables Reset). */
  hasDefault: boolean;
  onApply: (data: PredData) => void;
  onReset: () => void;
}

// At most one popover open at a time.
let current: { el: HTMLElement; dispose: () => void } | null = null;

function closeCurrent(): void {
  current?.dispose();
  current = null;
}

/**
 * Open a floating editor for one predicate's extensional data: a format
 * toggle, a textarea, and Apply / Reset / Close. Positioned next to the
 * clicked chip; dismissed on Escape or an outside click.
 */
export function openDataPopover(opts: DataPopoverOptions): void {
  closeCurrent();

  const el = document.createElement("div");
  el.className = "datamog-embed-popover";

  // A predicate's data keeps the format the author shipped it in (CSV or
  // JSONL); the reader edits the rows in that format rather than switching it,
  // since the two formats are not interchangeable for typed columns. Default
  // to CSV when there is no pre-baked data to take the format from.
  const format = opts.initial?.format ?? "csv";

  const title = el.appendChild(document.createElement("div"));
  title.className = "datamog-embed-popover-title";
  title.textContent = `Data for ${opts.predicate}(${opts.columns.join(", ")}) · ${format.toUpperCase()}`;

  const textarea = el.appendChild(document.createElement("textarea"));
  textarea.className = "datamog-embed-popover-text";
  textarea.value = opts.initial?.text ?? "";
  textarea.spellcheck = false;
  textarea.rows = 6;

  const footer = el.appendChild(document.createElement("div"));
  footer.className = "datamog-embed-popover-footer";

  const apply = footer.appendChild(document.createElement("button"));
  apply.type = "button";
  apply.className = "datamog-embed-popover-apply";
  apply.textContent = "Apply";
  apply.addEventListener("click", () => {
    opts.onApply({ format, text: textarea.value });
    closeCurrent();
  });

  const reset = footer.appendChild(document.createElement("button"));
  reset.type = "button";
  reset.className = "datamog-embed-popover-reset";
  reset.textContent = "Reset";
  reset.disabled = !opts.hasDefault;
  reset.addEventListener("click", () => {
    opts.onReset();
    closeCurrent();
  });

  const close = footer.appendChild(document.createElement("button"));
  close.type = "button";
  close.className = "datamog-embed-popover-close";
  close.textContent = "Close";
  close.addEventListener("click", () => closeCurrent());

  document.body.appendChild(el);

  // Position under the chip, kept within the viewport horizontally.
  const rect = opts.anchor.getBoundingClientRect();
  el.style.top = `${rect.bottom + 4}px`;
  el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeCurrent();
  };
  const onDown = (e: MouseEvent) => {
    if (!el.contains(e.target as Node) && e.target !== opts.anchor) closeCurrent();
  };
  document.addEventListener("keydown", onKey);
  // Defer the outside-click listener so the opening click doesn't close it.
  setTimeout(() => document.addEventListener("mousedown", onDown), 0);

  current = {
    el,
    dispose: () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      el.remove();
    },
  };

  textarea.focus();
}
