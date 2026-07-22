# Embed tutorials

Markdown tutorials whose Datamog code blocks render as live, editable
mini-playgrounds. Unlike the full playground, each embed runs on the main
thread with the pure-TS native/seminaive backend (no Web Worker, no WASM), so
several can sit on one page.

- [`getting-started.md`](getting-started.md) — the source tutorial.

## Authoring

Write normal Markdown. Any fenced ```` ```datamog ```` block becomes an
interactive embed. A block that declares `input predicate` predicates gets
pre-baked data from sibling files in `data/`, matched by predicate name (the
same file-per-predicate convention the CLI examples use):

- `data/<predicate>.csv` — CSV with a header row, or
- `data/<predicate>.jsonl` — one JSON object per line.

A block with no matching data file just runs with whatever rows the reader
types. In the rendered page the reader clicks `▸ run` next to a query to
evaluate it (the result panel appears below the line and collapses), and clicks
the data chip next to an `input predicate` declaration to view, edit, or reset its
rows.

## Rendering

```bash
bun run tutorial:html   # render this tutorial
```

This runs `scripts/build-tutorial-html.mjs`, which inlines each ```` ```datamog ````
block as a `<div data-datamog>` payload, themes the page with
`scripts/doc-style.mjs` (shared with the spec renderer), and writes
`packages/playground/tutorial.html`. The output is a gitignored build artifact;
`playground:dev` and `playground:build` regenerate it via `docs:html`. Vite
serves it in dev and bundles it as a second page for GitHub Pages, where it
lives at `<site>/tutorial.html`.

The renderer currently reads a single hard-coded source file
(`getting-started.md`); adding another tutorial means editing `SRC_MD` in the
script, not just dropping in a `.md`.
