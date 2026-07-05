// Turn ```mermaid fenced code blocks into `<pre class="mermaid">` so the
// client-side Mermaid runtime renders them, instead of letting Shiki
// syntax-highlight the source as if it were code. Running as a remark plugin
// (before rehype/Shiki) means the highlighter never sees the block.

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function remarkMermaid() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child.type === "code" && child.lang === "mermaid") {
          child.type = "html";
          child.value = `<pre class="mermaid">${escapeHtml(child.value)}</pre>`;
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
