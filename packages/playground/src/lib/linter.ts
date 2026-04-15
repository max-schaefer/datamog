import { linter, type Diagnostic } from "@codemirror/lint";
import * as bridge from "../worker/bridge.ts";

export const datamogLinter = linter(async (view) => {
  const source = view.state.doc.toString();
  const results = await bridge.lint(source);
  const diagnostics: Diagnostic[] = [];

  for (const d of results) {
    const from = d.from ?? 0;
    const to = Math.min(d.to ?? source.length, source.length);
    diagnostics.push({ from, to, severity: "error", message: d.message });
  }

  return diagnostics;
});
