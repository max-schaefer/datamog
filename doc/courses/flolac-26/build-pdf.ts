#!/usr/bin/env bun
// Render a Markdown handout (with Mermaid diagrams and LaTeX math) to PDF.
//
// We have no pandoc/TeX here, and pandoc cannot render the Mermaid block
// anyway, so we render the document much as GitHub does: Markdown -> HTML
// with Mermaid.js for diagrams and KaTeX for `$...$` / `$$...$$` math, then
// print to PDF with headless Chromium (Playwright's bundled browser, already
// a dev dependency).
//
// Rendering libraries are pulled from a CDN at build time, so the only local
// requirement is Playwright's Chromium. Run with:
//
//   bun run doc/courses/flolac-26/build-pdf.ts [input.md] [output.pdf]

import { chromium } from "@playwright/test";

const input = process.argv[2] ?? new URL("./handout.md", import.meta.url).pathname;
const output = process.argv[3] ?? input.replace(/\.md$/, ".pdf");

// A4 with equal margins. The content column is sized to the printable width so
// that what the browser lays out matches the printed page exactly (this also
// lets the in-page "shrink overflowing math" pass measure against the real
// page width rather than the viewport).
const PAGE = { marginMm: 16, widthMm: 210, heightMm: 297 };
const contentMm = PAGE.widthMm - 2 * PAGE.marginMm;
const contentHeightPx = ((PAGE.heightMm - 2 * PAGE.marginMm) / 25.4) * 96;
// Cap diagram height to a little over half the printable page height. A diagram
// taller than the space left on a page is bumped whole to the next page (we
// keep `break-inside: avoid`), which would leave a large gap above it; capping
// the height lets it fit the typical remaining space instead.
const maxDiagramPx = Math.round(contentHeightPx * 0.55);

const markdown = await Bun.file(input).text();

// KaTeX, unlike the MathJax that GitHub uses, does not break a bare "\\" line
// break in top-level display math, so a long formula authored with one stays a
// single over-wide line (then gets shrunk to a tiny font to fit). Wrap any such
// formula in a "gathered" environment, which KaTeX does honour, so the intended
// line break takes effect at full size. Formulas that already declare their own
// environment (e.g. \begin{aligned}) are left untouched.
const prepared = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (match, body) =>
  /\\\\/.test(body) && !/\\begin\{/.test(body)
    ? `$$\\begin{gathered}${body}\\end{gathered}$$`
    : match,
);

// Embed the source as JSON so no Markdown character needs escaping; the only
// thing that can break a <script> block is the literal "</script>" sequence.
const sourceJson = JSON.stringify(prepared).replace(/<\/script>/gi, "<\\/script>");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<style>
  :root { color-scheme: light; }
  body { margin: 0; }
  .markdown-body {
    box-sizing: border-box;
    width: ${contentMm}mm;
    margin: 0 auto;
    font-size: 10.5pt;
  }
  /* Nothing should be able to push past the page edge. */
  .markdown-body img, .markdown-body svg, .markdown-body table { max-width: 100%; }
  .mermaid-rendered { text-align: center; margin: 1em 0; }
  .mermaid-rendered svg { max-width: 100%; height: auto; }
  /* Keep code blocks, tables, diagrams and display math from splitting across pages. */
  pre, table, .mermaid-rendered, .katex-display { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
</style>
<script type="application/json" id="source">${sourceJson}</script>
</head>
<body>
<article id="content" class="markdown-body"></article>
<script type="module">
  import MarkdownIt from "https://esm.sh/markdown-it@14";
  import katex from "https://esm.sh/@vscode/markdown-it-katex@1";
  import mermaid from "https://esm.sh/mermaid@11";

  try {
    const source = JSON.parse(document.getElementById("source").textContent);

    // Render Markdown -> HTML. The KaTeX plugin tokenises $...$ / $$...$$
    // before inline rules run, so math is protected from Markdown mangling and
    // typeset synchronously by KaTeX.
    const md = new MarkdownIt({ html: true, linkify: true })
      .use(katex.default ?? katex, { throwOnError: false });
    document.getElementById("content").innerHTML = md.render(source);

    // Render each fenced \`\`\`mermaid block. markdown-it emits them as
    // <code class="language-mermaid">; textContent gives the un-escaped source.
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
    const maxDiagramPx = ${maxDiagramPx};
    const colPx = document.querySelector(".markdown-body").clientWidth;
    const blocks = [...document.querySelectorAll("code.language-mermaid")];
    for (let i = 0; i < blocks.length; i++) {
      const { svg } = await mermaid.render("mermaid-" + i, blocks[i].textContent);
      const wrap = document.createElement("div");
      wrap.className = "mermaid-rendered";
      wrap.innerHTML = svg;
      blocks[i].closest("pre").replaceWith(wrap);

      // Size the diagram explicitly from its viewBox, capped to the column
      // width and a fraction of the page height so a tall diagram isn't bumped
      // whole to the next page (which would leave a big gap above it). Never
      // upscale.
      const el = wrap.querySelector("svg");
      const vb = el.viewBox.baseVal;
      if (vb && vb.width && vb.height) {
        const scale = Math.min(colPx / vb.width, maxDiagramPx / vb.height, 1);
        el.removeAttribute("width");
        el.removeAttribute("height");
        el.style.width = vb.width * scale + "px";
        el.style.height = vb.height * scale + "px";
      }
    }

    // A display formula wider than the column would be clipped at the page
    // edge (KaTeX, unlike MathJax, does not break a bare "\\\\"). Shrink any
    // such block proportionally until it fits.
    const avail = document.querySelector(".markdown-body").clientWidth - 2;
    for (const disp of document.querySelectorAll(".katex-display")) {
      const k = disp.querySelector(".katex");
      if (k && k.scrollWidth > avail) {
        k.style.fontSize = Math.floor((avail / k.scrollWidth) * 100) + "%";
      }
    }

    window.__renderState = "ok";
  } catch (err) {
    window.__renderState = "error: " + (err && err.stack ? err.stack : err);
  }
</script>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Lay out at the printable width so measurements match the PDF.
  await page.setViewportSize({ width: Math.round((contentMm / 25.4) * 96), height: 1200 });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__renderState !== undefined", { timeout: 60_000 });
  const state = await page.evaluate("window.__renderState");
  if (state !== "ok") {
    throw new Error(`Rendering failed: ${state}\n${pageErrors.join("\n")}`);
  }
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    margin: {
      top: `${PAGE.marginMm}mm`,
      bottom: `${PAGE.marginMm}mm`,
      left: `${PAGE.marginMm}mm`,
      right: `${PAGE.marginMm}mm`,
    },
  });
  console.log(`Wrote ${output}`);
} finally {
  await browser.close();
}
