import type { QueryResult } from "datamog-engine";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { formatCell } from "../lib/format-cell.ts";
import {
  type Granularity,
  type RelationSnapshot,
  type Snapshot,
  type Stop,
  captionFor,
  computeStops,
  snapshotAt,
  tupleKey,
} from "../lib/trace-state.ts";
import type { SourceSpan, StepResult } from "../worker/bridge.ts";
import { type Format, FormatToggle, JsonView } from "./format-toggle.tsx";
import { MermaidView } from "./mermaid-view.tsx";
import { ResultsPanel } from "./results-panel.tsx";

interface Props {
  result: StepResult;
  onHoverRange: (range: SourceSpan | null) => void;
}

const GRANULARITIES: Granularity[] = ["rule", "iteration", "stratum"];

const PLAY_SPEEDS = [
  { label: "slow", intervalMs: 2000 },
  { label: "normal", intervalMs: 1200 },
  { label: "fast", intervalMs: 500 },
] as const;
type PlaySpeed = (typeof PLAY_SPEEDS)[number]["label"];

const GRANULARITY_TOOLTIPS: Record<Granularity, string> = {
  rule: "Stop at every rule application, including passes that produce nothing new.",
  iteration: "Stop once per fixed-point iteration (one pass over every rule).",
  stratum: "Stop once per stratum after its fixed point is reached.",
};

export function StepPanel({ result, onHoverRange }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("iteration");
  const [stopIdx, setStopIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>("normal");
  /**
   * Per-stratum manual expand/collapse override. A stratum's *default*
   * state is driven by the current stop (past → collapsed, current/future
   * → expanded). When the user clicks a stratum header they flip its
   * default, and the override persists until navigation changes the stop.
   */
  const [stratumOverrides, setStratumOverrides] = useState<Set<number>>(new Set());
  /**
   * Same override for the "Extensional data" section. Defaults to auto
   * (collapsed once we enter any stratum event); manual toggle flips it
   * until navigation resets the override.
   */
  const [extensionalOverride, setExtensionalOverride] = useState(false);
  /**
   * DOM refs for each predicate's relation table and each stratum box, so
   * we can scroll the relation currently being updated into view on every
   * step change. Maps are populated via callback refs on the child
   * components; entries are removed when their elements unmount.
   */
  const relationRefs = useRef(new Map<string, HTMLElement>());
  const stratumRefs = useRef(new Map<number, HTMLElement>());
  /**
   * Suppress the first auto-scroll so the panel opens at the top of the
   * snapshot rather than jumping to whichever relation the initial stop
   * mentions.
   */
  const didMountRef = useRef(false);

  // Reset navigation when the trace itself changes (new run).
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetting on identity change, not value
  useEffect(() => {
    setStopIdx(0);
    setPlaying(false);
    setStratumOverrides(new Set());
    setExtensionalOverride(false);
  }, [result]);

  // Any navigation drops manual collapse overrides — the default auto-collapse
  // rule takes over at every stop. The dependency on `stopIdx` is the whole
  // point of the effect, even though the body doesn't read it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect fires on navigation
  useEffect(() => {
    setStratumOverrides(new Set());
    setExtensionalOverride(false);
  }, [stopIdx]);

  const stops = useMemo(
    () => computeStops(result.events, granularity),
    [result.events, granularity],
  );

  // Clamp current stop when granularity changes (number of stops differs).
  useEffect(() => {
    if (stopIdx >= stops.length) setStopIdx(stops.length - 1);
  }, [stops.length, stopIdx]);

  const currentStop = stops[stopIdx] ?? stops[0]!;
  const prevEventIdx = stopIdx === 0 ? -1 : (stops[stopIdx - 1]?.eventIndex ?? -1);

  const snapshot = useMemo(
    () => snapshotAt(result.events, currentStop.eventIndex, prevEventIdx, result.schema),
    [result.events, result.schema, currentStop.eventIndex, prevEventIdx],
  );

  // Sync editor highlight with the current rule-applied event.
  useEffect(() => {
    const e = currentStop.event;
    if (e && e.kind === "rule-applied" && e.ruleSpan) {
      onHoverRange({ start: e.ruleSpan.offset, end: e.ruleSpan.end });
    } else {
      onHoverRange(null);
    }
    // When the panel unmounts (step mode turned off) the parent clears the
    // hover itself; we don't need a cleanup that fights with that.
  }, [currentStop, onHoverRange]);

  // Scroll the relation being updated into view on every step change.
  // We prefer targeting the first newly-added row inside the table — that's
  // the visually interesting change, and it's what `block: "nearest"`
  // actually has to chase. Scrolling the wrapper `<div>` isn't enough:
  // `nearest` no-ops as soon as any part of the wrapper is visible, so
  // bottom-of-table additions would stay off-screen. `scroll-padding-top`
  // on the panel keeps targets clear of the sticky header.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const e = currentStop.event;
    if (!e) return;

    let predicate: string | undefined;
    let stratumIdx: number | undefined;
    if (e.kind === "edb-loaded") predicate = e.predicate;
    else if (e.kind === "rule-applied") {
      predicate = e.predicate;
      stratumIdx = e.stratum;
    } else if ("stratum" in e) {
      stratumIdx = e.stratum;
    }

    const relTable = predicate ? relationRefs.current.get(predicate) : undefined;
    const stratumBox = stratumIdx !== undefined ? stratumRefs.current.get(stratumIdx) : undefined;
    // `.added` rows are the new tuples at this step. We target the *last*
    // added row so long runs of additions (where the table grows downward)
    // are followed to the end, not anchored at the top. For rule-applied
    // events we look inside the named predicate's table first; for iteration
    // /stratum-end events (which don't name a predicate) we search the whole
    // stratum box, which contains tables for every predicate in the stratum.
    // If there's nothing new this step, fall back to the table or stratum
    // header so the user still sees the thing the event refers to.
    const addedRows =
      relTable?.querySelectorAll("tr.added") ?? stratumBox?.querySelectorAll("tr.added");
    const lastAdded = (
      addedRows && addedRows.length > 0 ? addedRows[addedRows.length - 1] : undefined
    ) as HTMLElement | undefined;
    const target = lastAdded ?? relTable ?? stratumBox;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentStop]);

  // Auto-advance when "play" is engaged. Stops at the last stop.
  const playInterval = PLAY_SPEEDS.find((s) => s.label === speed)?.intervalMs ?? 1200;
  useEffect(() => {
    if (!playing) return;
    if (stopIdx >= stops.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setStopIdx((i) => Math.min(i + 1, stops.length - 1)),
      playInterval,
    );
    return () => clearTimeout(timer);
  }, [playing, stopIdx, stops.length, playInterval]);

  const goPrev = () => {
    setPlaying(false);
    setStopIdx((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    setPlaying(false);
    setStopIdx((i) => Math.min(stops.length - 1, i + 1));
  };
  const goStart = () => {
    setPlaying(false);
    setStopIdx(0);
  };
  const goEnd = () => {
    setPlaying(false);
    setStopIdx(stops.length - 1);
  };
  const togglePlay = () => {
    if (stopIdx >= stops.length - 1) setStopIdx(0);
    setPlaying((p) => !p);
  };

  const caption = captionFor(currentStop, result.schema);
  const atEnd = stopIdx === stops.length - 1;

  const toggleStratum = (sIdx: number) => {
    setStratumOverrides((s) => {
      const n = new Set(s);
      if (n.has(sIdx)) n.delete(sIdx);
      else n.add(sIdx);
      return n;
    });
  };

  // Extensionals are "past" as soon as any IDB evaluation begins. The
  // initial stop (eventIndex = -1) and edb-loaded stops keep them expanded.
  const extensionalsPastDefault = !!currentStop.event && currentStop.event.kind !== "edb-loaded";
  const extensionalsCollapsed = extensionalOverride
    ? !extensionalsPastDefault
    : extensionalsPastDefault;

  return (
    <div class="step-panel">
      <div class="step-sticky-header">
        <StepControls
          stopIdx={stopIdx}
          total={stops.length}
          playing={playing}
          granularity={granularity}
          speed={speed}
          onGranularityChange={(g) => {
            setPlaying(false);
            setGranularity(g);
          }}
          onSpeedChange={setSpeed}
          onPrev={goPrev}
          onNext={goNext}
          onStart={goStart}
          onEnd={goEnd}
          onTogglePlay={togglePlay}
        />
        <div class="step-caption">{caption}</div>
      </div>
      <TraceTree
        stops={stops}
        currentIdx={stopIdx}
        onSelect={(i) => {
          setPlaying(false);
          setStopIdx(i);
        }}
      />
      <div class="step-snapshot">
        {result.extensionals.length > 0 && (
          <ExtensionalsView
            extensionals={result.extensionals}
            schema={result.schema}
            snapshot={snapshot}
            collapsed={extensionalsCollapsed}
            onToggle={() => setExtensionalOverride((o) => !o)}
            onRelationRef={(predicate, el) => {
              if (el) relationRefs.current.set(predicate, el);
              else relationRefs.current.delete(predicate);
            }}
          />
        )}
        {result.strata.map((stratum, sIdx) => {
          const defaultCollapsed = isStratumPast(sIdx, currentStop.event);
          const collapsed = stratumOverrides.has(sIdx) ? !defaultCollapsed : defaultCollapsed;
          return (
            <StratumView
              // biome-ignore lint/suspicious/noArrayIndexKey: stratum index is stable
              key={sIdx}
              stratum={stratum}
              stratumIdx={sIdx}
              currentEvent={currentStop.event}
              extensionals={new Set(result.extensionals)}
              schema={result.schema}
              snapshot={snapshot}
              collapsed={collapsed}
              onToggle={() => toggleStratum(sIdx)}
              onStratumRef={(el) => {
                if (el) stratumRefs.current.set(sIdx, el);
                else stratumRefs.current.delete(sIdx);
              }}
              onRelationRef={(predicate, el) => {
                if (el) relationRefs.current.set(predicate, el);
                else relationRefs.current.delete(predicate);
              }}
            />
          );
        })}
      </div>
      {atEnd && result.queries.length > 0 && (
        <div class="step-queries">
          <div class="step-section-title">Query results</div>
          <QueryResultsMini queries={result.queries} />
        </div>
      )}
    </div>
  );
}

/**
 * True when stratum `idx` has already been fully evaluated at the current
 * event. We treat a stratum as "past" only once we've moved on to an event
 * in a strictly later stratum — the stratum-end event itself still shows
 * the stratum expanded so the user can see its final state.
 */
function isStratumPast(idx: number, event: StepResult["events"][number] | undefined): boolean {
  if (!event) return false;
  if (event.kind === "edb-loaded") return false;
  if ("stratum" in event) return event.stratum > idx;
  return false;
}

// 16×16 codicon-style glyphs for the step toolbar. Using inline SVG over
// Unicode arrows so the buttons match the visual weight of VS Code's debug
// toolbar (solid shapes, `currentColor` fill that picks up hover/disabled
// state from the surrounding CSS).
function IconFirst() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 3h1.5v10H4V3zm9 .2v9.6L6.5 8 13 3.2z" />
    </svg>
  );
}
function IconPrev() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11 3.2v9.6L4.5 8 11 3.2z" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 3.2v9.6L12.5 8 4.5 3.2z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 3h2.5v10H4.5V3zm4.5 0h2.5v10H9V3z" />
    </svg>
  );
}
function IconNext() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 3.2v9.6L11.5 8 5 3.2z" />
    </svg>
  );
}
function IconLast() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.5 3H12v10h-1.5V3zM3 3.2L9.5 8 3 12.8V3.2z" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M2 3.5h6L5 7.5z" />
    </svg>
  );
}

function StepControls({
  stopIdx,
  total,
  playing,
  granularity,
  speed,
  onGranularityChange,
  onSpeedChange,
  onPrev,
  onNext,
  onStart,
  onEnd,
  onTogglePlay,
}: {
  stopIdx: number;
  total: number;
  playing: boolean;
  granularity: Granularity;
  speed: PlaySpeed;
  onGranularityChange: (g: Granularity) => void;
  onSpeedChange: (s: PlaySpeed) => void;
  onPrev: () => void;
  onNext: () => void;
  onStart: () => void;
  onEnd: () => void;
  onTogglePlay: () => void;
}) {
  return (
    <div class="step-controls">
      <div class="step-nav-group">
        <div class="step-nav" role="toolbar" aria-label="Step controls">
          <button
            type="button"
            onClick={onStart}
            disabled={stopIdx === 0}
            title="First"
            aria-label="First"
          >
            <IconFirst />
          </button>
          <button
            type="button"
            onClick={onPrev}
            disabled={stopIdx === 0}
            title="Previous"
            aria-label="Previous"
          >
            <IconPrev />
          </button>
          <button
            type="button"
            class="step-play"
            onClick={onTogglePlay}
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={stopIdx >= total - 1}
            title="Next"
            aria-label="Next"
          >
            <IconNext />
          </button>
          <button
            type="button"
            onClick={onEnd}
            disabled={stopIdx >= total - 1}
            title="Last"
            aria-label="Last"
          >
            <IconLast />
          </button>
        </div>
        <span class="step-counter">
          {stopIdx + 1} / {total}
        </span>
      </div>
      <div class="step-options">
        <div class="step-option" title="Auto-advance speed when playing">
          <span class="step-option-label">Speed</span>
          <div class="segmented">
            {PLAY_SPEEDS.map((s) => (
              <button
                key={s.label}
                type="button"
                class={speed === s.label ? "active" : ""}
                onClick={() => onSpeedChange(s.label)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div class="step-option">
          <span class="step-option-label">Granularity</span>
          <div class="segmented">
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                type="button"
                class={granularity === g ? "active" : ""}
                onClick={() => onGranularityChange(g)}
                title={GRANULARITY_TOOLTIPS[g]}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceTree({
  stops,
  currentIdx,
  onSelect,
}: {
  stops: Stop[];
  currentIdx: number;
  onSelect: (i: number) => void;
}) {
  // Scroll the currently-selected marker into view when navigation changes.
  // The dep on `currentIdx` is the whole point — Biome flags it because the
  // effect body doesn't read `currentIdx` directly (it reads the ref the
  // index points at), but without this dep the effect only fires on mount
  // and the user's navigation never scrolls the marker into view.
  const currentRef = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect fires on navigation
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentIdx]);

  return (
    <div class="step-tree">
      {stops.map((s, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: stop index is stable for a given events+granularity
          key={i}
          ref={i === currentIdx ? currentRef : undefined}
          type="button"
          class={`step-tree-item ${i === currentIdx ? "current" : ""}`}
          onClick={() => onSelect(i)}
          title={stopLabelFull(s)}
        >
          {stopLabelShort(s, i)}
        </button>
      ))}
    </div>
  );
}

function stopLabelShort(stop: Stop, idx: number): string {
  if (!stop.event) return "start";
  const e = stop.event;
  switch (e.kind) {
    case "edb-loaded":
      return `EDB ${e.predicate}`;
    case "rule-applied":
      return `s${e.stratum}·i${e.iteration} ${e.predicate}[${e.ruleIndex}]${e.added.length ? ` +${e.added.length}` : ""}`;
    case "iteration-end":
      return `s${e.stratum} iter ${e.iteration} ${e.added === 0 ? "★" : `+${e.added}`}`;
    case "stratum-end":
      return `s${e.stratum} done (${e.iterations})`;
    default:
      return String(idx);
  }
}

function stopLabelFull(stop: Stop): string {
  if (!stop.event) return "Before evaluation";
  const e = stop.event;
  switch (e.kind) {
    case "edb-loaded":
      return `Loaded ${e.tuples.length} rows into '${e.predicate}'`;
    case "rule-applied":
      return `Rule application (stratum ${e.stratum}, iteration ${e.iteration}): ${e.predicate} rule ${e.ruleIndex}, derived ${e.derived}, added ${e.added.length}`;
    case "iteration-end":
      return `Iteration ${e.iteration} of stratum ${e.stratum} complete — ${e.added} new tuples`;
    case "stratum-end":
      return `Stratum ${e.stratum} converged after ${e.iterations} iterations`;
    default:
      return "";
  }
}

function StratumView({
  stratum,
  stratumIdx,
  currentEvent,
  extensionals,
  schema,
  snapshot,
  collapsed,
  onToggle,
  onStratumRef,
  onRelationRef,
}: {
  stratum: { predicates: string[]; recursive: boolean };
  stratumIdx: number;
  currentEvent: StepResult["events"][number] | undefined;
  extensionals: Set<string>;
  schema: Record<string, string[]>;
  snapshot: Snapshot;
  collapsed: boolean;
  onToggle: () => void;
  onStratumRef: (el: HTMLElement | null) => void;
  onRelationRef: (predicate: string, el: HTMLElement | null) => void;
}) {
  // Show only predicates that are IDBs — EDBs get their own section below.
  const idbs = stratum.predicates.filter((p) => !extensionals.has(p));
  if (idbs.length === 0) return null;

  const isCurrent =
    currentEvent && "stratum" in currentEvent && currentEvent.stratum === stratumIdx;

  // Compact summary when collapsed: total tuple count per predicate.
  const summary = idbs
    .map((p) => `${p} (${snapshot.relations.get(p)?.tuples.length ?? 0})`)
    .join(", ");

  return (
    <div
      ref={onStratumRef}
      class={`stratum-box ${isCurrent ? "current" : ""} ${collapsed ? "collapsed" : ""}`}
    >
      <button
        type="button"
        class="stratum-header"
        onClick={onToggle}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <span class="stratum-chevron" aria-hidden="true">
          <IconChevron />
        </span>
        Stratum {stratumIdx}
        {stratum.recursive && <span class="stratum-tag">recursive</span>}
        {collapsed && <span class="stratum-summary">— {summary}</span>}
      </button>
      {!collapsed &&
        idbs.map((predicate) => (
          <RelationTable
            key={predicate}
            predicate={predicate}
            columns={schema[predicate] ?? []}
            snapshot={snapshot.relations.get(predicate)}
            onRef={(el) => onRelationRef(predicate, el)}
          />
        ))}
    </div>
  );
}

function ExtensionalsView({
  extensionals,
  schema,
  snapshot,
  collapsed,
  onToggle,
  onRelationRef,
}: {
  extensionals: string[];
  schema: Record<string, string[]>;
  snapshot: Snapshot;
  collapsed: boolean;
  onToggle: () => void;
  onRelationRef: (predicate: string, el: HTMLElement | null) => void;
}) {
  // Compact summary when collapsed: total tuple count per EDB.
  const summary = extensionals
    .map((p) => `${p} (${snapshot.relations.get(p)?.tuples.length ?? 0})`)
    .join(", ");

  return (
    <div class={`stratum-box extensional ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        class="stratum-header"
        onClick={onToggle}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <span class="stratum-chevron" aria-hidden="true">
          <IconChevron />
        </span>
        Extensional data
        {collapsed && <span class="stratum-summary">— {summary}</span>}
      </button>
      {!collapsed &&
        extensionals.map((predicate) => (
          <RelationTable
            key={predicate}
            predicate={predicate}
            columns={schema[predicate] ?? []}
            snapshot={snapshot.relations.get(predicate)}
            onRef={(el) => onRelationRef(predicate, el)}
          />
        ))}
    </div>
  );
}

function RelationTable({
  predicate,
  columns,
  snapshot,
  onRef,
}: {
  predicate: string;
  columns: string[];
  snapshot: RelationSnapshot | undefined;
  onRef?: (el: HTMLElement | null) => void;
}) {
  const [format, setFormat] = useState<Format>("table");
  const tuples = snapshot?.tuples ?? [];
  const added = snapshot?.newlyAddedKeys ?? new Set<string>();
  const mermaidAvailable = columns.length >= 2;

  // If the user picks Mermaid and then the schema turns out to be unary
  // (shouldn't happen mid-trace, but be defensive), fall back to table.
  const effectiveFormat: Format = format === "mermaid" && !mermaidAvailable ? "table" : format;

  // Build rows lazily for non-table views; table view reads tuple.values
  // directly so it can key on `tupleKey(t)` and preserve row identity for
  // the newly-added highlight + auto-scroll target.
  const needRows = effectiveFormat !== "table";
  const rows = needRows ? tuplesToRows(tuples, columns) : [];

  return (
    <div class="relation-table" ref={onRef}>
      <div class="relation-name">
        <span>
          {predicate} <span class="relation-size">({tuples.length})</span>
        </span>
        {tuples.length > 0 && (
          <FormatToggle value={format} onChange={setFormat} mermaidAvailable={mermaidAvailable} />
        )}
      </div>
      {tuples.length === 0 ? (
        <div class="relation-empty">∅</div>
      ) : effectiveFormat === "table" ? (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tuples.map((t) => {
              const k = tupleKey(t);
              return (
                <tr key={k} class={added.has(k) ? "added" : ""}>
                  {t.values.map((v, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional column index is stable
                    <td key={i}>{formatValue(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : effectiveFormat === "mermaid" ? (
        <MermaidView rows={rows} />
      ) : (
        <JsonView rows={rows} />
      )}
    </div>
  );
}

function tuplesToRows(
  tuples: { values: unknown[] }[],
  columns: string[],
): Record<string, unknown>[] {
  return tuples.map((t) => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      row[columns[i]!] = t.values[i];
    }
    return row;
  });
}

function formatValue(v: unknown): string {
  // `null` keeps its own glyph in the step view (visually distinct
  // from "missing" in the surrounding code paths). Everything else
  // routes through the shared `formatCell` helper so json compounds
  // render as JSON text instead of `"[object Object]"`.
  if (v === null) return "∅";
  return formatCell(v);
}

function QueryResultsMini({ queries }: { queries: QueryResult[] }) {
  // Reuse the main ResultsPanel for parity with non-step mode output.
  return <ResultsPanel results={queries} />;
}
