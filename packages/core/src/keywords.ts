// Single source of truth for the lexical surface of Datamog. The Langium
// grammar (`packages/parser/src/datamog.langium`) is authoritative; these
// arrays mirror it so the editor highlighters and any other consumers
// don't drift independently.
//
// Update both this file and the grammar together when adding a new
// keyword or type — the editor highlighter (CodeMirror StreamLanguage in
// the playground, TextMate grammar in the VS Code extension) consumes
// these lists.

/** Reserved-word keywords that can't be used as identifiers. */
export const RESERVED_KEYWORDS = ["extensional", "not", "in", "true", "false", "null"] as const;

/** Built-in primitive types declarable on extensional columns. */
export const BUILTIN_TYPE_NAMES = ["string", "integer", "float", "boolean", "value"] as const;
