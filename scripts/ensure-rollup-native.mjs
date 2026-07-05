// Vite's bundler (rollup) loads a platform-specific native binary at startup.
// Bun sometimes fails to hoist rollup's platform-specific optional dependency
// when the lockfile was generated on a different OS/arch, causing
// `bun run playground:build` / `playground:dev` to crash with a
// `Cannot find module @rollup/rollup-<platform>` error.
//
// This script probes whether rollup can load its native binary from vite's
// perspective (that's the consumer that'll actually need it) and, if not,
// runs `bun install --force` to repair the install. The probe runs in a
// child process because Node.js caches failed module loads within a
// process — calling require() again from the same process would see the
// cached failure even after a successful reinstall.

import { execSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const playgroundDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "playground",
);

// Returns null on success, the error message otherwise.
function probe() {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require("node:module");
       const vite = require.resolve("vite", { paths: [${JSON.stringify(playgroundDir)}] });
       createRequire(vite)("rollup");`,
    ],
    { encoding: "utf8" },
  );
  if (result.status === 0) return null;
  const msg = (result.stderr || result.stdout || "").toString();
  if (/@rollup\/rollup-/.test(msg)) return msg;
  // Unrelated failure (vite missing altogether, etc.) — surface it as-is.
  console.error(msg);
  process.exit(result.status ?? 1);
}

if (probe() !== null) {
  console.warn(
    "rollup's platform-specific native binary is missing — running `bun install --force` to repair.",
  );
  execSync("bun install --force", { stdio: "inherit" });
  const retry = probe();
  if (retry !== null) {
    console.error("rollup still can't load its native binary after a forced reinstall:");
    console.error(retry);
    console.error(
      "\nTry `rm -rf node_modules && bun install` manually, or report this as a Bun optional-dep bug.",
    );
    process.exit(1);
  }
}
