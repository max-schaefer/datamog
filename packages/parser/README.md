# datamog-parser

Langium-based parser for the Datamog Datalog dialect. The grammar is defined in `datamog.langium` and the lexer, parser, and AST types are generated from it.

## Usage

```ts
import { parse } from "datamog-parser";

const program = parse(`
  extensional parent(name: string, child: string).
  ancestor(X, Y) :- parent(X, Y).
  ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
  ?- ancestor("alice", X).
`);

for (const stmt of program.statements) {
  console.log(stmt.$type); // "ExtDecl", "Rule", or "Query"
}
```

## Syntax

```
# Comments run to end of line
extensional <name>(<col>: <type>, ...).   # extensional declaration
<head>(<args>) :- <body>, ... .           # rule
<head>(<args>).                           # fact (rule with empty body)
?- <atom>.                                # query
```

Column types: `string`, `integer`, `float`, `boolean`, `value`.

## Post-processing

After parsing, `postProcess()` applies four AST transforms:

1. **Don't-care variable desugaring:** each `_` is renamed to a unique internal variable name.
2. **Numeric literal preservation:** the raw source text of number literals is preserved on a `rawText` property to distinguish `1` from `1.0`.
3. **Aggregate rewriting:** `FunctionCall` nodes in rule head positions whose name is an aggregate (`count`, `sum`, `avg`, `min`, `max`, `concat`, `list`) are rewritten to `AggregateCall`.
4. **Bracket-access splitting:** the unified `BracketAccess` node the grammar produces (to avoid an LL(k) ambiguity) is split into `Subscript` (`x[i]`) or `Slice` (`x[i:j]`) based on whether a `:` was present.

## Langium services

For advanced use (e.g. building a language server), the Langium services are also exported:

```ts
import { createDatamogServices } from "datamog-parser";

const services = createDatamogServices();
```
