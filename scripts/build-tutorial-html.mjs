// Render an embed tutorial (`doc/embed-tutorials/<name>.md`) to an HTML page
// under the playground package root, where Vite serves it in dev and bundles
// it (as a multi-page input) for GitHub Pages.
//
// Every fenced ```datamog block becomes an interactive embed: the block is
// replaced by a `<div data-datamog>` placeholder carrying a JSON payload
// (the program plus any pre-baked data), which `src/embed/index.ts` mounts at
// load time. Data is pulled from `doc/embed-tutorials/data/<predicate>.csv`
// (or `.jsonl`), matched by the block's `extensional` declarations — the same
// file-per-predicate convention the CLI examples use.
//
// The output is a generated artifact (gitignored); regenerate with
// `bun run tutorial:html`, or let `playground:build` / `playground:dev` run it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { DOC_STYLE } from "./doc-style.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_MD = join(root, "doc", "embed-tutorials", "getting-started.md");
const DATA_DIR = join(root, "doc", "embed-tutorials", "data");
const OUT_HTML = join(root, "packages", "playground", "tutorial.html");

marked.setOptions({ gfm: true });

// Predicate names declared `extensional` in a code block, skipping comments.
function extensionalNames(source) {
  const names = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^extensional\s+([A-Za-z_]\w*)/);
    if (m) names.push(m[1]);
  }
  return names;
}

// Pre-baked data for a block's extensionals, read from sibling files by name.
function dataForBlock(source) {
  const csv = {};
  const jsonl = {};
  for (const name of extensionalNames(source)) {
    const csvPath = join(DATA_DIR, `${name}.csv`);
    const jsonlPath = join(DATA_DIR, `${name}.jsonl`);
    if (existsSync(csvPath)) csv[name] = readFileSync(csvPath, "utf8");
    else if (existsSync(jsonlPath)) jsonl[name] = readFileSync(jsonlPath, "utf8");
  }
  const data = {};
  if (Object.keys(csv).length) data.csv = csv;
  if (Object.keys(jsonl).length) data.jsonl = jsonl;
  return data;
}

// Replace every ```datamog fence with a single-line `<div data-datamog>` HTML
// block (surrounded by blank lines so marked treats it as raw HTML and passes
// it through). `<` is escaped to < so a program containing `</script>`
// can't terminate the payload script early.
function inlineEmbeds(md) {
  return md.replace(/^```datamog[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm, (_m, body) => {
    const payload = { source: body, ...dataForBlock(body) };
    const json = JSON.stringify(payload).replaceAll("<", "\\u003c");
    return `\n\n<div data-datamog><script type="application/json">${json}</script></div>\n\n`;
  });
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-") || "section"
  );
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

const md = readFileSync(SRC_MD, "utf8");
const body = marked.parse(inlineEmbeds(md), { async: false });

// Inject stable heading ids and collect an h2/h3 table of contents, mirroring
// the spec renderer so deep links and the TOC sidebar work the same way.
const seen = new Map();
const toc = [];
const withIds = body.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
  const depth = Number(level);
  const label = stripTags(inner);
  let slug = slugify(label);
  const n = seen.get(slug) ?? 0;
  seen.set(slug, n + 1);
  if (n > 0) slug = `${slug}-${n}`;
  if (depth === 2 || depth === 3) toc.push({ depth, slug, label });
  return `<h${level} id="${slug}">${inner}</h${level}>`;
});

const tocHtml = toc.length
  ? `<nav class="toc" aria-label="Table of contents">
      <div class="toc-title">Contents</div>
      <ul>
        ${toc.map((e) => `<li class="toc-l${e.depth}"><a href="#${e.slug}">${e.label}</a></li>`).join("\n        ")}
      </ul>
    </nav>`
  : "";

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Datamog Tutorial</title>
    <link rel="icon" href="/favicon.jpg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <script>
      try {
        const stored = localStorage.getItem("datamog-theme");
        if (stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches)) {
          document.documentElement.dataset.theme = "dark";
        }
      } catch (_) {}
    </script>
    <style>${DOC_STYLE}</style>
  </head>
  <body>
    <header class="spec-header">
      <a class="spec-home" href="./">&larr; Datamog Playground</a>
      <span class="sep">|</span>
      <span class="wordmark">Tutorial</span>
    </header>
    <main class="spec-main">
      ${tocHtml}
      <article class="spec-body">
        ${withIds}
      </article>
    </main>
    <script type="module" src="/src/embed/index.ts"></script>
  </body>
</html>
`;

writeFileSync(OUT_HTML, html);
console.log(`Wrote ${OUT_HTML} (${toc.length} TOC entries, ${(html.length / 1024).toFixed(0)} KB)`);
