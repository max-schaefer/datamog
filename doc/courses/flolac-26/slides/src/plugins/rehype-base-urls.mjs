// Prefix root-relative src/href in slide bodies with the deck's base path.
// Astro base-prefixes URLs in layouts/components, but NOT URLs written in
// Markdown bodies, so those 404 when the deck is served from a sub-path
// (GitHub Pages: /datamog/slides/). Two kinds occur: Markdown `![](/x)` images
// become hast `element` nodes, while raw `<img src="/x">` / `<a href="/x">`
// tags pass through as raw HTML strings; handle both. The base is taken from
// DECK_BASE exactly as astro.config does; at the root base ("/") this is a no-op.

export default function rehypeBaseUrls() {
  const base = process.env.DECK_BASE ?? "/";
  if (base === "/") return () => {};
  const bare = base.slice(1); // "datamog/slides/"

  const rebase = (v) =>
    typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith(base)
      ? base + v.slice(1)
      : v;

  // Raw HTML passthrough: rewrite root-relative src="/…" / href="/…" by string.
  const rebaseRaw = (html) =>
    html.replace(/\b(src|href)="\/(?!\/)([^"]*)"/g, (m, attr, path) =>
      path.startsWith(bare) ? m : `${attr}="${base}${path}"`);

  return (tree) => {
    const walk = (node) => {
      if (node?.type === "element" && node.properties) {
        if (node.properties.src !== undefined) node.properties.src = rebase(node.properties.src);
        if (node.properties.href !== undefined) node.properties.href = rebase(node.properties.href);
      } else if ((node?.type === "raw" || node?.type === "html") && typeof node.value === "string") {
        node.value = rebaseRaw(node.value);
      }
      if (Array.isArray(node?.children)) for (const c of node.children) walk(c);
    };
    walk(tree);
  };
}
