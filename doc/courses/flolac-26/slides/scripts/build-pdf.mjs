#!/usr/bin/env bun
// Export the FLOLAC slide deck to a single landscape PDF.
//
// The deck is an Astro static site (one HTML page per slide). We serve the
// built `dist/` with a tiny static server, then drive headless Chromium
// (Playwright, already a dev dependency) over every slide in presentation
// order: each deck's entry point comes from the home page, and within a deck
// we follow the same `data-next` chain the arrow keys use. Each slide is
// rendered with its client scripts so Mermaid diagrams and live embeds appear,
// printed to one 16:9 page, and the pages are merged with pdf-lib.
//
//   bun run slides:pdf                          # build, then export
//   bun run scripts/build-pdf.mjs [out.pdf]     # export an existing dist/

import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";

const distDir = new URL("../dist/", import.meta.url).pathname;
const outPath =
  process.argv[2] ?? new URL("../flolac-slides.pdf", import.meta.url).pathname;
const PORT = 4331;
const WIDTH = 1280;
const HEIGHT = 720;

if (!existsSync(join(distDir, "index.html"))) {
  console.error(`No build found at ${distDir}\nRun \`bun run build\` first.`);
  process.exit(1);
}

// Serve the static build so root-absolute asset paths (/images, /embed) resolve.
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith("/")) path += "index.html";
    let file = Bun.file(join(distDir, path));
    if (!(await file.exists()) && !extname(path)) {
      file = Bun.file(join(distDir, path, "index.html"));
    }
    return (await file.exists())
      ? new Response(file)
      : new Response("not found", { status: 404 });
  },
});
const origin = `http://localhost:${PORT}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
// Keep the on-screen styling; page.pdf() would otherwise switch to print media.
await page.emulateMedia({ media: "screen" });

// Presentation order: the home page links each deck's first slide (in deck
// order); from there we follow `data-next` to the end of that deck.
await page.goto(`${origin}/`, { waitUntil: "networkidle" });
const deckStarts = await page.$$eval(".home__deck a", (as) =>
  as.map((a) => a.getAttribute("href")),
);

const slideUrls = [];
for (const start of deckStarts) {
  let href = start;
  while (href && !slideUrls.includes(href)) {
    slideUrls.push(href);
    await page.goto(origin + href, { waitUntil: "domcontentloaded" });
    href = await page.evaluate(() => document.body.dataset.next ?? null);
  }
}

// Render each slide (waiting for embeds and diagrams) and append one page each.
const merged = await PDFDocument.create();
for (const [i, href] of slideUrls.entries()) {
  await page.goto(origin + href, { waitUntil: "networkidle" });
  if (await page.locator("[data-datamog]").count()) {
    await page
      .locator(".datamog-embed .cm-editor")
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {});
  }
  await page
    .waitForFunction(
      () => {
        const m = [...document.querySelectorAll("pre.mermaid")];
        return m.length === 0 || m.every((e) => e.querySelector("svg"));
      },
      { timeout: 8000 },
    )
    .catch(() => {});
  const bytes = await page.pdf({
    width: `${WIDTH}px`,
    height: `${HEIGHT}px`,
    printBackground: true,
    pageRanges: "1",
  });
  const doc = await PDFDocument.load(bytes);
  const [copied] = await merged.copyPages(doc, [0]);
  merged.addPage(copied);
  process.stdout.write(`\r  rendered ${i + 1}/${slideUrls.length} slides`);
}
process.stdout.write("\n");

await Bun.write(outPath, await merged.save());
await browser.close();
await server.stop();
console.log(`Wrote ${slideUrls.length} slides to ${outPath}`);
