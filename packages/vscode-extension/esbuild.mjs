import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const shared = {
  absWorkingDir: __dirname,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  minify: !watch,
  target: "node18",
};

const extensionBuild = esbuild.build({
  ...shared,
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
});

const serverBuild = esbuild.build({
  ...shared,
  entryPoints: ["src/language-server.ts"],
  outfile: "out/language-server.js",
});

await Promise.allSettled([extensionBuild, serverBuild]);

if (watch) {
  const ctx1 = await esbuild.context({
    ...shared,
    entryPoints: ["src/extension.ts"],
    outfile: "out/extension.js",
  });
  const ctx2 = await esbuild.context({
    ...shared,
    entryPoints: ["src/language-server.ts"],
    outfile: "out/language-server.js",
  });
  await Promise.allSettled([ctx1.watch(), ctx2.watch()]);
  console.log("Watching for changes...");
}
