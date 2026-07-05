import type { ActiveCycle } from "../worker/bridge.ts";

// Module-level dispatcher so a CodeMirror diagnostic action (which has
// no React/Preact context) can hand a cycle to the App-owned modal.
// The App registers a handler in an effect; the lint extension calls
// `showCycle()` from the action's `apply` callback.

type Handler = (cycle: ActiveCycle) => void;

let handler: Handler | null = null;

export function setCycleHandler(h: Handler | null): void {
  handler = h;
}

export function showCycle(cycle: ActiveCycle): void {
  handler?.(cycle);
}
