// Make external links (http/https) open in a new tab. Runs on the HTML AST,
// so it only sees links generated from Markdown `[text](url)` syntax; raw
// `<a>` tags written inline in a slide pass through untouched (they already
// set their own target/rel).

const isExternal = (href) =>
  typeof href === "string" && /^https?:\/\//.test(href);

export default function rehypeExternalLinks() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (
          child.type === "element" &&
          child.tagName === "a" &&
          isExternal(child.properties?.href)
        ) {
          child.properties.target = "_blank";
          child.properties.rel = ["noopener"];
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
