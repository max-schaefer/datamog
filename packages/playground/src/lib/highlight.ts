import { LanguageSupport, StreamLanguage } from "@codemirror/language";

const keywords = new Set(["extensional", "not", "in", "mod"]);
const types = new Set(["text", "integer", "real", "boolean"]);

const datamogStreamParser = StreamLanguage.define({
  token(stream) {
    // Comments
    if (stream.match("%")) {
      stream.skipToEnd();
      return "lineComment";
    }

    // Whitespace
    if (stream.eatSpace()) return null;

    // Strings
    if (stream.match('"')) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") stream.next();
        else if (ch === '"') break;
      }
      return "string";
    }

    // Numbers
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return "number";

    // Two-char operators
    if (stream.match("?-") || stream.match(":-")) return "punctuation";
    if (stream.match("<=") || stream.match(">=") || stream.match("!=") || stream.match(".."))
      return "operator";

    // Single-char operators
    if (stream.match(/^[+\-*/<>=]/)) return "operator";

    // Variables (uppercase or underscore start)
    if (stream.match(/^[A-Z_][a-zA-Z0-9_]*/)) return "variableName";

    // Identifiers (lowercase start) — may be keywords, types, or predicate names
    const ident = stream.match(/^[a-z][a-zA-Z0-9_]*/);
    if (ident) {
      const word = ident[0];
      if (keywords.has(word)) return "keyword";
      if (types.has(word)) return "typeName";
      return "name";
    }

    // Punctuation
    if (stream.match(/^[().,\[\]:]/)) return "punctuation";

    // Anything else
    stream.next();
    return null;
  },
});

export function datamogLanguage(): LanguageSupport {
  return new LanguageSupport(datamogStreamParser);
}
