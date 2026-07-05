import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import rehypeBaseUrls from "./src/plugins/rehype-base-urls.mjs";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import remarkDatamog from "./src/plugins/remark-datamog.mjs";
import remarkMermaid from "./src/plugins/remark-mermaid.mjs";
import { datamogGrammar, datamogTheme } from "./src/datamog-shiki.mjs";

// `DECK_BASE` lets the deck be served from a sub-path (e.g. GitHub Pages under
// `/datamog/slides/`); locally it defaults to the site root.
const base = process.env.DECK_BASE ?? "/";

// remark-datamog inlines `src/demo-data/<deck>/<pred>` files into slides, but
// Astro only tracks the `.md` as a dependency, so editing a data file alone
// wouldn't refresh its slide. Watch the data dir in dev and restart on a
// change so the remark plugin re-runs. (Builds clear the content cache; see the
// `build` script in package.json.)
function watchDemoData() {
  const dataDir = fileURLToPath(new URL("./src/demo-data", import.meta.url));
  return {
    name: "datamog-demo-data-watch",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(dataDir);
    },
    async handleHotUpdate({ file, server }) {
      if (file.startsWith(dataDir)) {
        await server.restart();
        return [];
      }
    },
  };
}

export default defineConfig({
  base,
  trailingSlash: "always",
  prefetch: { defaultStrategy: "viewport" },
  vite: { plugins: [watchDemoData()] },
  markdown: {
    remarkPlugins: [remarkMermaid, remarkDatamog],
    rehypePlugins: [rehypeExternalLinks, rehypeBaseUrls],
    shikiConfig: {
      theme: datamogTheme,
      langs: [datamogGrammar, "sql", "bash"],
      wrap: false,
    },
  },
});
