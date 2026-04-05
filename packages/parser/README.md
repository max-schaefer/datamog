# datamog-parser

Hand-written lexer and recursive-descent parser for the Datamog Datalog dialect.

## Usage

```ts
import { parse } from "datamog-parser";

const program = parse(`
  extensional parent(name: text, child: text).
  ancestor(X, Y) :- parent(X, Y).
  ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
  ?- ancestor("alice", X).
`);

for (const stmt of program.statements) {
  console.log(stmt.kind); // "ext_decl", "rule", or "query"
}
```

## Syntax

```
% Comments run to end of line
extensional <name>(<col>: <type>, ...).   % extensional declaration
<head>(<args>) :- <body>, ... .           % rule
<head>(<args>).                           % fact (rule with empty body)
?- <atom>.                                % query
```

Column types: `text`, `integer`, `real`, `boolean`.

## Lower-level API

The lexer and parser are also exported separately:

```ts
import { tokenize, Parser } from "datamog-parser";

const tokens = tokenize(source);
const program = new Parser(tokens).parse();
```
