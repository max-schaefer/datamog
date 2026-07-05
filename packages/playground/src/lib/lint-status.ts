// Module-level dispatcher so the CodeMirror linter (which runs inside
// an extension and has no React/Preact context) can notify the App
// whenever the lint pass produces an updated status — error count and
// whether the program contains a `?-` query. The App registers a
// handler in an effect; the linter calls `notifyLintStatus` after
// each pass.

export interface LintStatus {
  hasErrors: boolean;
  hasQueries: boolean;
}

type Handler = (status: LintStatus) => void;

let handler: Handler | null = null;

export function setLintStatusHandler(h: Handler | null): void {
  handler = h;
}

export function notifyLintStatus(status: LintStatus): void {
  handler?.(status);
}
