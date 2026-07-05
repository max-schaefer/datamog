import { type Diagnostic, linter } from "@codemirror/lint";
import { StateEffect } from "@codemirror/state";
import * as bridge from "../worker/bridge.ts";
import { type DiagnosticCycle, setDiagnosticCycles } from "./cycle-highlight.ts";
import { showCycle } from "./cycle-viewer.ts";
import { setPredicateReferences } from "./jump-to-def.ts";
import { notifyLintStatus } from "./lint-status.ts";
import { setRecursiveCalls } from "./recursive-marker.ts";
import { getShowWarnings } from "./warnings.ts";

// Dispatched when external state (like the warnings toggle) changes
// and the linter needs to re-run even though the document hasn't.
// `forceLinting` alone would no-op here — it only runs a lint that's
// already queued, and the queue is empty between document edits.
export const refreshLintEffect = StateEffect.define<null>();

export const datamogLinter = linter(
  async (view) => {
    const source = view.state.doc.toString();
    const results = await bridge.lint(source);
    const diagnostics: Diagnostic[] = [];
    const cycleEntries: DiagnosticCycle[] = [];
    const showWarnings = getShowWarnings();

    for (const d of results.diagnostics) {
      if (d.severity === "warning" && !showWarnings) continue;
      const from = d.from ?? 0;
      const to = Math.min(d.to ?? source.length, source.length);
      const diag: Diagnostic = { from, to, severity: d.severity, message: d.message };
      if (d.cycle && d.cycle.cycle.nodes.length > 0) {
        // CodeMirror renders these as buttons in the lint tooltip. The
        // dispatcher hands the cycle to the App-owned modal — we can't
        // reach React/Preact state directly from inside a CM extension.
        const cycle = d.cycle;
        diag.actions = [{ name: "Show cycle", apply: () => showCycle(cycle) }];
        // Mirror the cycle into a position-indexed table so the hover
        // plugin can light up the in-code highlight without going
        // through the modal.
        cycleEntries.push({ from, to, cycle });
      }
      diagnostics.push(diag);
    }

    // Push annotation effects through dedicated StateFields. All three
    // ride the same parse+analyse pass as the diagnostics — no extra
    // worker round-trip — so markers update in lockstep with squigglies.
    view.dispatch({
      effects: [
        setRecursiveCalls.of(results.recursiveCalls),
        setPredicateReferences.of(results.predicateReferences),
        setDiagnosticCycles.of(cycleEntries),
      ],
    });
    // Surface the error count and query presence to the App so it can
    // disable the Run button. We notify on every pass — including
    // transitions back to "no errors" / "queries added" — so the
    // button re-enables as soon as the user fixes the offending
    // source or adds a `?-` line.
    notifyLintStatus({
      hasErrors: results.diagnostics.some((d) => d.severity === "error"),
      hasQueries: results.hasQueries,
    });

    return diagnostics;
  },
  {
    needsRefresh: (update) =>
      update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLintEffect))),
  },
);
