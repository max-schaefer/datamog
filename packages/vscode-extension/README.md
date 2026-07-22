# Datamog VS Code Extension

Language support for the [Datamog](../../README.md) Datalog dialect.

## Features

- **Syntax highlighting** for `.dl` files — keywords, predicates, variables, aggregates, types, strings, numbers, and comments
- **Live diagnostics** — parse errors from the Langium parser and semantic errors from the Datamog analyzer (arity mismatches, unsafe variables, unstratifiable negation, aggregate validation)
- **Smart auto-complete** — context-aware completions for predicate names, built-in functions, and keywords
- **Bracket matching** and auto-closing for `()`, `[]`, `""`
- **Comment toggling** with `#`
- **Run File** — evaluate the active `.dl` buffer in-process (seminaive backend) and show query results in the "Datamog" Output channel. Invoke via the editor title-bar play button, the `Datamog: Run File` command, or `Ctrl/Cmd+Enter`.

  The runner evaluates the buffer as-is (no save required). Extensional data is loaded from sibling files next to a **saved** program, one file per predicate: `<predicate>.csv`, `<predicate>.json` (whole-file value), or `<predicate>.jsonl` (probed in that order). Predicates with no matching data file — or any `input predicate` declaration in an unsaved buffer — are flagged as empty in the output and a warning.

## Build and install

From the repository root:

```bash
bun install
bun run build:vscode
code --install-extension packages/vscode-extension/datamog.vsix
```

## Development

Open the `packages/vscode-extension` folder in VS Code and press **F5** to launch an Extension Development Host with the extension loaded. Changes to the language server require rebuilding (`node esbuild.mjs`).

For watch mode during development:

```bash
node esbuild.mjs --watch
```

## Architecture

The extension consists of two bundled entry points:

- **`out/extension.js`** — the VS Code extension client, which spawns the language server as a child process
- **`out/language-server.js`** — a Langium-powered language server that provides parsing (via the Datamog grammar) and validation (via `datamog-core`'s analyzer and type inference)

The `datamog.run` command lives in the client bundle ([`src/run-command.ts`](src/run-command.ts)); it drives `datamog-engine`'s `DatamogExecutor` against the in-process `datamog-backend-seminaive` evaluator, so running a file needs no external service and no Bun runtime. Extensional data is read from disk by [`src/disk-loader.ts`](src/disk-loader.ts), a Node counterpart to the engine's Bun-only directory loader: it reads with `node:fs` and parses through the platform-neutral `datamog-csv/parse-content`, `datamog-json/parse-content`, and `datamog-jsonl/parse-content` entry points (the same ones the browser playground uses).

The Datamog grammar is defined in [`packages/parser/src/datamog.langium`](../parser/src/datamog.langium). Langium generates the parser, lexer, and AST types from this grammar. The language server registers the Datamog analyzer as a Langium validation check, so semantic errors appear as diagnostics in the editor.
