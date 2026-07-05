// Entry point for the embeddable mini-playground. Mounts every
// `[data-datamog]` element on the page once the DOM is ready, and also
// exports `mountAll` so a host can mount on demand (e.g. after injecting
// content).
import { mountAll } from "./mount.ts";

export { mountAll } from "./mount.ts";
export { createEmbedEditor } from "./editor.ts";
export { runProgram, lintSource } from "./engine.ts";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountAll());
} else {
  mountAll();
}
