// Render the language specification (`doc/spec.md`) to a self-contained HTML
// page and write it to the playground's `public/` directory, where Vite
// serves it in dev and copies it into `dist/` for GitHub Pages. The page is
// linked from the playground toolbar.
//
// The output is a generated artifact (gitignored); regenerate with
// `bun run spec:html`, or let `playground:build` / `playground:dev` run it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { DOC_STYLE } from "./doc-style.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_MD = join(root, "doc", "spec.md");
const OUT_HTML = join(root, "packages", "playground", "public", "spec.html");

marked.setOptions({ gfm: true });

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-") || "section"
  );
}

// Strip tags from a heading's rendered inner HTML to get a plain-text label.
// marked has already entity-escaped the text, so the result is safe to embed.
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

const md = readFileSync(SPEC_MD, "utf8");
const body = marked.parse(md, { async: false });

// Inject stable `id`s on headings (so TOC anchors and deep links work) and
// collect a table of contents from the h2/h3 levels. Post-processing the
// rendered HTML keeps this independent of marked's renderer-API churn; the
// global replace runs in document order, so the slug dedup counter stays in
// sync between the TOC and the headings.
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
    <title>Datamog Language Specification</title>
    <link rel="icon" href="./datamog-mark.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <script>
      // Match the playground's theme preference (shared localStorage key),
      // falling back to the OS setting when no choice has been stored.
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
      <span class="wordmark">Language Specification</span>
    </header>
    <main class="spec-main">
      ${tocHtml}
      <article class="spec-body">
        ${withIds}
      </article>
    </main>
  </body>
</html>
`;

mkdirSync(dirname(OUT_HTML), { recursive: true });
writeFileSync(OUT_HTML, html);
console.log(`Wrote ${OUT_HTML} (${toc.length} TOC entries, ${(html.length / 1024).toFixed(0)} KB)`);
