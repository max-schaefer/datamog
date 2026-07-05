import type { FinitenessCycle, NegationCycle } from "datamog-core";
import { useEffect, useRef, useState } from "preact/hooks";
import { lazyAsync } from "../lib/lazy.ts";
import { escapeMermaidLabel } from "../lib/mermaid-label.ts";
import { type Theme, getCurrentTheme, subscribeTheme } from "../lib/theme.ts";
import type { ActiveCycle } from "../worker/bridge.ts";

interface CycleModalProps {
  cycle: ActiveCycle | null;
  onClose: () => void;
}

// Lazy singleton — avoids pulling the mermaid bundle in until the user
// actually opens a cycle. `lazyAsync` clears the cache on rejection so
// a transient module-load failure doesn't permanently stick the modal.
const loadMermaid = lazyAsync(() => import("mermaid").then((m) => m.default));

let diagramSeq = 0;

// Mermaid `linkStyle N stroke:...` colours for the highlighted edge
// kinds. Hard-coded because mermaid's theme token system doesn't
// expose stroke colours per-edge cleanly, and we want these to match
// the corresponding diagnostic severity (amber = warning, red = error).
const COLOUR_GROW = "#d97706";
const COLOUR_NEGATIVE = "#dc2626";

interface ModalRender {
  title: string;
  source: string;
  legend: { className: string; label: string }[];
}

function renderFinitenessCycle(cycle: FinitenessCycle): ModalRender {
  const lines: string[] = ["graph LR"];
  for (let i = 0; i < cycle.nodes.length; i++) {
    const node = cycle.nodes[i]!;
    lines.push(`  n${i}["${escapeMermaidLabel(node.label)}"]`);
  }
  for (let i = 0; i < cycle.edges.length; i++) {
    const e = cycle.edges[i]!;
    lines.push(`  n${e.from} -->|${e.growing ? "grows" : "flows"}| n${e.to}`);
  }
  cycle.edges.forEach((e, i) => {
    if (e.growing) {
      lines.push(`  linkStyle ${i} stroke:${COLOUR_GROW},stroke-width:2.5px,color:${COLOUR_GROW}`);
    }
  });
  return {
    title: "Recursion cycle",
    source: lines.join("\n"),
    legend: [
      { className: "cycle-legend-swatch-grow", label: "grows the value" },
      { className: "cycle-legend-swatch-flow", label: "passes the value through" },
    ],
  };
}

function renderNegationCycle(cycle: NegationCycle): ModalRender {
  const lines: string[] = ["graph LR"];
  for (let i = 0; i < cycle.nodes.length; i++) {
    const node = cycle.nodes[i]!;
    lines.push(`  n${i}["${escapeMermaidLabel(node.label)}"]`);
  }
  for (let i = 0; i < cycle.edges.length; i++) {
    const e = cycle.edges[i]!;
    // Edge label only on negative edges — positive deps need no
    // qualifier, and a label on every arrow clutters the cycle.
    lines.push(e.negative ? `  n${e.from} -->|"not"| n${e.to}` : `  n${e.from} --> n${e.to}`);
  }
  cycle.edges.forEach((e, i) => {
    if (e.negative) {
      lines.push(
        `  linkStyle ${i} stroke:${COLOUR_NEGATIVE},stroke-width:2.5px,color:${COLOUR_NEGATIVE}`,
      );
    }
  });
  return {
    title: "Stratification cycle",
    source: lines.join("\n"),
    legend: [
      { className: "cycle-legend-swatch-neg", label: "negated dependency" },
      { className: "cycle-legend-swatch-pos", label: "positive dependency" },
    ],
  };
}

function renderCycle(active: ActiveCycle): ModalRender {
  return active.kind === "finiteness"
    ? renderFinitenessCycle(active.cycle)
    : renderNegationCycle(active.cycle);
}

export function CycleModal({ cycle, onClose }: CycleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => subscribeTheme(setTheme), []);

  // Open/close the native <dialog> in response to the `cycle` prop. Using
  // showModal() (rather than rendering conditionally) gives us native
  // focus trapping, Escape-to-close, and the ::backdrop pseudo-element
  // for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (cycle) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [cycle]);

  const rendered = cycle ? renderCycle(cycle) : null;

  useEffect(() => {
    if (!rendered) return;
    let cancelled = false;
    setError(null);
    const id = `cycle-mermaid-${++diagramSeq}`;
    loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: theme === "dark" ? "dark" : "default",
        });
        return mermaid.render(id, rendered.source);
      })
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !diagramRef.current) return;
        diagramRef.current.innerHTML = svg;
        bindFunctions?.(diagramRef.current);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [rendered, theme]);

  // Click-outside-to-close: a click on the dialog element itself (rather
  // than any descendant) means the user clicked the backdrop.
  const handleDialogClick = (e: MouseEvent) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is handled by the native <dialog>'s built-in Escape behavior; the onClick here only implements "click outside the panel content" which has no keyboard equivalent
    <dialog
      ref={dialogRef}
      class="cycle-modal"
      aria-label={rendered?.title ?? "Cycle"}
      onClick={handleDialogClick}
      onClose={onClose}
      data-testid="cycle-modal"
    >
      <div class="cycle-modal-header">
        <span class="cycle-modal-title">{rendered?.title ?? "Cycle"}</span>
        <button
          type="button"
          class="cycle-modal-close"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          ×
        </button>
      </div>
      <div class="cycle-modal-body">
        {error ? (
          <div class="error-box">Failed to render diagram: {error}</div>
        ) : (
          <div ref={diagramRef} class="cycle-modal-diagram" />
        )}
      </div>
      <div class="cycle-modal-legend">
        {rendered?.legend.map((item) => (
          <span class="cycle-legend-item" key={item.className}>
            <span class={`cycle-legend-swatch ${item.className}`} /> {item.label}
          </span>
        ))}
      </div>
    </dialog>
  );
}
