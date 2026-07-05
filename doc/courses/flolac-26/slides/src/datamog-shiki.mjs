// A minimal Shiki (TextMate) grammar + theme for Datamog. Registered under the
// `prolog`/`datalog` aliases so the deck's ```prolog fences pick it up. It fixes
// what the generic Prolog grammar gets wrong for Datamog: `#` line comments,
// and the `?-` / `:-` clause operators (coloured the same teal as inline code,
// so a `?-` reads identically in prose and in a code block).

export const datamogGrammar = {
  name: "datamog",
  scopeName: "source.datamog",
  aliases: ["prolog", "datalog"],
  patterns: [
    { include: "#comment" },
    { include: "#string" },
    { include: "#number" },
    { include: "#clause" },
    { include: "#keyword" },
    { include: "#type" },
    { include: "#operator" },
    { include: "#variable" },
  ],
  repository: {
    comment: { name: "comment.line.number-sign.datamog", match: "#.*$" },
    string: {
      name: "string.quoted.double.datamog",
      begin: '"',
      end: '"',
      patterns: [{ name: "constant.character.escape.datamog", match: "\\\\." }],
    },
    number: {
      name: "constant.numeric.datamog",
      match: "\\b0[bB][01]+\\b|\\b[0-9]+(\\.[0-9]+)?\\b",
    },
    // `?-` (query) and `:-` (rule) clause operators.
    clause: { name: "keyword.operator.clause.datamog", match: "\\?-|:-" },
    keyword: {
      name: "keyword.control.datamog",
      match: "\\b(extensional|not|in|true|false|null)\\b",
    },
    type: {
      name: "storage.type.datamog",
      match: "\\b(string|integer|float|boolean|value)\\b",
    },
    operator: {
      name: "keyword.operator.datamog",
      match: "!=|<=|>=|>>>|<<|>>|\\*\\*|[=<>+\\-*/%&|^~]",
    },
    variable: {
      name: "variable.other.datamog",
      match: "\\b[A-Z_][A-Za-z0-9_]*\\b",
    },
  },
};

export const datamogTheme = {
  name: "datamog-light",
  type: "light",
  colors: { "editor.background": "#f5f8f7", "editor.foreground": "#1f2328" },
  settings: [
    { settings: { background: "#f5f8f7", foreground: "#1f2328" } },
    {
      scope: ["comment"],
      settings: { foreground: "#8a9298", fontStyle: "italic" },
    },
    {
      scope: ["string", "constant.character.escape"],
      settings: { foreground: "#b05a16" },
    },
    { scope: ["constant.numeric"], settings: { foreground: "#2b6cb0" } },
    {
      scope: [
        "keyword.operator.clause",
        "keyword.operator",
        "keyword.control",
        "storage.type",
      ],
      settings: { foreground: "#2f8576" },
    },
    { scope: ["variable"], settings: { foreground: "#7b4fb0" } },
  ],
};
