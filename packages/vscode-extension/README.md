# Datamog VS Code Extension

Language support for the [Datamog](../../README.md) Datalog dialect.

## Features

- **Syntax highlighting** for `.dl` files — keywords, predicates, variables, aggregates, types, strings, numbers, and comments
- **Live diagnostics** — parse errors from the Langium parser and semantic errors from the Datamog analyzer (arity mismatches, unsafe variables, unstratifiable negation, aggregate validation)
- **Bracket matching** and auto-closing for `()`, `[]`, `""`
- **Comment toggling** with `%`

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

The Datamog grammar is defined in [`packages/parser/src/datamog.langium`](../parser/src/datamog.langium). Langium generates the parser, lexer, and AST types from this grammar. The language server registers the Datamog analyzer as a Langium validation check, so semantic errors appear as diagnostics in the editor.
