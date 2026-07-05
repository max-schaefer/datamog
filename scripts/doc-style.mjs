// Shared CSS for the standalone doc pages rendered from Markdown (the language
// spec and the embed tutorials). Both pages use the same `.spec-main` /
// `.spec-body` structure so this one stylesheet themes them identically,
// including the dark-mode swap keyed off `html[data-theme="dark"]`.
export const DOC_STYLE = `
  :root {
    --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --muted: #64748b;
    --border: #e2e8f0; --primary: #4f46e5; --code-bg: #f1f5f9;
    --shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }
  html[data-theme="dark"] {
    --bg: #0b1120; --surface: #111827; --text: #e5e7eb; --muted: #94a3b8;
    --border: #1f2937; --primary: #818cf8; --code-bg: #1e293b;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: Inter, system-ui, -apple-system, sans-serif;
    line-height: 1.65; font-size: 16px;
  }
  .spec-header {
    position: sticky; top: 0; z-index: 10; display: flex; align-items: center;
    gap: 14px; padding: 12px 24px; background: var(--surface);
    border-bottom: 1px solid var(--border); box-shadow: var(--shadow);
  }
  .spec-home {
    color: var(--primary); text-decoration: none; font-weight: 600; font-size: 14px;
  }
  .spec-home:hover { text-decoration: underline; }
  .spec-header .sep { color: var(--border); }
  .spec-header .wordmark { color: var(--muted); font-size: 14px; font-weight: 500; }
  .spec-main {
    max-width: 1200px; margin: 0 auto; padding: 32px 24px;
    display: grid; grid-template-columns: 1fr; gap: 32px;
  }
  @media (min-width: 1100px) {
    .spec-main { grid-template-columns: 250px minmax(0, 1fr); }
    .toc { position: sticky; top: 80px; align-self: start; max-height: calc(100vh - 110px); overflow-y: auto; }
  }
  .toc {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 18px; font-size: 14px;
  }
  .toc-title {
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    font-size: 11px; color: var(--muted); margin-bottom: 10px;
  }
  .toc ul { list-style: none; margin: 0; padding: 0; }
  .toc li { margin: 2px 0; }
  .toc a { color: var(--text); text-decoration: none; display: block; padding: 2px 0; }
  .toc a:hover { color: var(--primary); }
  .toc-l3 { padding-left: 14px; font-size: 13px; }
  .toc-l3 a { color: var(--muted); }
  .spec-body { min-width: 0; }
  .spec-body h1 { font-size: 30px; line-height: 1.25; margin: 0 0 16px; }
  .spec-body h2 {
    font-size: 23px; margin: 40px 0 14px; padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .spec-body h3 { font-size: 18px; margin: 28px 0 10px; }
  .spec-body h4 { font-size: 16px; margin: 22px 0 8px; }
  .spec-body :is(h1, h2, h3, h4) { scroll-margin-top: 72px; }
  .spec-body a { color: var(--primary); }
  .spec-body p, .spec-body li { color: var(--text); }
  .spec-body code {
    font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.88em;
    background: var(--code-bg); padding: 0.15em 0.4em; border-radius: 5px;
    /* Disable programming ligatures: JetBrains Mono renders <=, >=, ==, !=,
       <> as glyphs the reader can't type. Keep the operators literal. */
    font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0;
  }
  .spec-body pre {
    background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 16px; overflow-x: auto; line-height: 1.5;
  }
  .spec-body pre code { background: none; padding: 0; font-size: 13.5px; }
  .spec-body blockquote {
    margin: 16px 0; padding: 2px 16px; border-left: 3px solid var(--primary);
    color: var(--muted);
  }
  .spec-body table {
    border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;
    display: block; overflow-x: auto;
  }
  .spec-body th, .spec-body td {
    border: 1px solid var(--border); padding: 7px 11px; text-align: left;
  }
  .spec-body th { background: var(--code-bg); font-weight: 600; }
  .spec-body hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
`;
