/**
 * Escape a label for Mermaid's `node["..."]` quoted syntax. Quotes,
 * backslashes, and angle brackets either break the lexer or get interpreted
 * as HTML tags. CR/LF are line-based graph syntax, so collapse them too.
 */
export function escapeMermaidLabel(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]/g, " ");
}
