// Turn ```datamog fenced code blocks into live, editable mini-playgrounds.
// Each block becomes a `<div data-datamog>` placeholder carrying a JSON payload
// (the program plus any pre-baked data); the embed bundle in `public/embed`
// mounts it client-side (see SlideLayout.astro). Static code listings keep using
// ```prolog and are left untouched.
//
// Pre-baked extensional data is pulled from `src/demo-data/<deck>/<pred>.csv`
// (or `.jsonl`), matched by the block's `input predicate` declarations - the same
// file-per-predicate convention the CLI examples and embed tutorial use. `<deck>`
// is the slide's parent folder (intro, part1, ...).

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// Predicate names declared `input predicate` in a block, skipping comment lines.
function extensionalNames(source) {
  const names = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^input\s+predicate\s+([A-Za-z_]\w*)/);
    if (m) names.push(m[1]);
  }
  return names;
}

// Pre-baked data for a block's extensionals, read from `src/demo-data/<deck>`.
function dataForBlock(source, dataDir) {
  const csv = {};
  const jsonl = {};
  for (const name of extensionalNames(source)) {
    const csvPath = join(dataDir, `${name}.csv`);
    const jsonlPath = join(dataDir, `${name}.jsonl`);
    if (existsSync(csvPath)) csv[name] = readFileSync(csvPath, "utf8");
    else if (existsSync(jsonlPath)) jsonl[name] = readFileSync(jsonlPath, "utf8");
  }
  const data = {};
  if (Object.keys(csv).length) data.csv = csv;
  if (Object.keys(jsonl).length) data.jsonl = jsonl;
  return data;
}

export default function remarkDatamog() {
  return (tree, file) => {
    // The markdown lives at <root>/src/content/slides/<deck>/<name>.md; demo data
    // lives at <root>/src/demo-data/<deck>. Resolve the data dir from the slide.
    const mdDir = file?.history?.[0] ? dirname(file.history[0]) : "";
    const deck = mdDir ? basename(mdDir) : "";
    const dataDir = mdDir ? join(mdDir, "../../../demo-data", deck) : "";

    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child.type === "code" && child.lang === "datamog") {
          const payload = { source: child.value, ...dataForBlock(child.value, dataDir) };
          // Escape `<` so a program containing `</script>` can't end the payload.
          const json = JSON.stringify(payload).replaceAll("<", "\\u003c");
          child.type = "html";
          child.value = `\n\n<div data-datamog><script type="application/json">${json}</script></div>\n\n`;
          delete child.lang;
          delete child.meta;
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
