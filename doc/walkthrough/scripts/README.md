# Walkthrough scripts

Utilities for maintaining the language walkthrough.

## `pg-link.mjs`

Produce a playground URL for a tutorial `.dl` file, inlining any
sibling CSV data as inline facts so the resulting URL is
self-contained (the URL fragment carries the program only, not CSV
data — see `packages/playground/src/app.tsx`).

Usage:

```bash
node doc/walkthrough/scripts/pg-link.mjs <path-to-dl>
```

Prints `<input-path>\t<url>` on stdout.

If you change the `.dl` file (or its sibling `.csv`) backing a
chapter's "Open this program in the playground" link, regenerate
the URL and paste it back into the relevant chapter's Markdown.
The URLs are long but stable; a quick `grep -n "Open this program"
doc/walkthrough/*.md` will find every link that might need updating.
