# Datamog

<p align="center">
  <img src="datamog.jpg" alt="Datamog" width="300" />
</p>

Datamog is an educational Datalog dialect that translates into SQL. It supports Horn clauses with extensional predicate declarations, stratified negation, and aggregates, and compiles rules into views (including recursive views for recursive predicates). A first-class `value` column type — the union of every shape (`null`, booleans, integers, floats, strings, arrays, objects), with subscript / slice / iteration / coercion / construction primitives and structural equality maintained across every backend — lets programs work with nested data directly, without pre-flattening. The project ships with three SQL backends (Postgres, SQLite, sql.js), two non-SQL in-memory evaluators (`native` and `seminaive`), and a VS Code extension for editor support.

## Runtime Support

Datamog's TypeScript packages are Bun-only when consumed directly. The
workspace publishes TypeScript source entry points and intentionally uses Bun
APIs such as `Bun.file`, `Bun.sql`, and `bun:sqlite`; Node.js runtime
compatibility is not currently a goal. Use Bun 1.3 or newer for development and
for running the CLI/packages directly.

The VS Code extension is the exception at install time: it is packaged as
bundled JavaScript for VS Code's extension host, so users of the `.vsix` do not
need Bun installed.

## Syntax

```prolog
# Declare input predicates (extensional, backed by tables)
input predicate parent(name: string, child: string).

# Define rules (Horn clauses)
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

# Query
?- ancestor("alice", X).
```

- **Input predicate declarations** (`input predicate`) define extensional predicates (EDB) backed by tables with typed columns (`string`, `integer`, `float`, `boolean`, `value`); add `?` for nullable input columns. An input can be bound to a source with `:=` (see [Modules](#modules)).
- **Rules** define intensional predicates. Multiple rules for the same predicate are combined with `UNION`. Recursive predicates use recursive views.
- **Facts** are rules with no body: `base_case("x").`
- **Queries** target a predicate directly: `?- p(X).`
- **Negation**: `not pred(X)` in a rule body compiles to `NOT EXISTS`. Negation must be stratifiable (no negation within recursive cycles).
- **Aggregates**: aggregate functions in rule heads define grouped views. Non-aggregate head arguments become `GROUP BY` columns:
  ```prolog
  num_children(P, count(C)) :- parent(P, C).
  total_score(sum(S)) :- scores(_, S).
  ```
  Supported functions: `count`, `sum`, `avg`, `min`, `max`, `concat`, `list` (primitives auto-lift to a `value`; result is an array `value`). Use `count(*)` for `COUNT(*)`. Aggregate predicates cannot be recursive.
- **Arithmetic**: `+`, `-`, `*`, `/`, `%`, and `**` (exponentiation, right-associative and float-valued) in expressions. Operator precedence follows standard conventions.
- **Comparisons**: `<`, `<=`, `>`, `>=`, `==`, `!=`, `=`, `<>`. The `=`/`<>` family is *logical* equality (null-aware: `null = null` is `true`), `==`/`!=` is *computational* (3VL: `null == X` is `null`).
- **Booleans**: `&&`, `||`, `!` (logical operators with three-valued logic on `null`).
- **Bitwise**: `&`, `|`, `^`, `<<`, `>>`, `>>>` on 32-bit signed integers (Java/JS semantics: `>>` arithmetic, `>>>` logical zero-fill, shift count mod 32).
- **Equalities**: `X = expr` or `expr = X` binds a bare variable when the other side is already safe; otherwise `=` is a logical equality filter.
- **Ranges**: `X in [1 .. 10]` generates integers (or filters values) within bounds.
- **String operations**: `+` on strings is concatenation, `length(X)` returns length, `X[0]` is subscript, `X[1:3]` is slice.
- **JSON support**: see the dedicated [JSON section](#json) below.
- **Don't-care variable**: `_` matches anything and is automatically renamed to a unique variable at each occurrence.
- **Queries** (`?-`) execute `SELECT` statements against the generated views.
- **Comments** start with `#` and run to end of line.

## Values

A `value` column holds the union of every shape: `null`, booleans, integers, floats, strings, arrays, and objects. Datamog gives you a small toolkit to read, project, iterate over, and (in narrow ways) construct them, all from inside a rule body. The name "JSON" is reserved for the syntax (JSONL files, parsing strings) and the on-disk representation; the language type is just `value`.

```prolog
input predicate event(payload: value).

# Destructure an event into flat columns. Wrong-shape access → NULL.
request(Id, Method, Path, Status) :-
    event(E),
    Id = as_integer(E["id"]),
    Method = as_string(E["method"]),
    Path = as_string(E["path"]),
    Status = as_integer(E["status"]).

# Iterate every key/value pair of a nested object value.
event_header(Id, Key, V) :-
    event(E),
    Id = as_integer(E["id"]),
    object_entry(E["headers"], Key, Raw),
    V = as_string(Raw).

# Construct: parse a string, or use array / object literals to
# assemble shapes directly. Primitives flowing into a `value` slot
# auto-lift, so no explicit primitive-to-value conversion is needed.
#   parse_json : string → value (NULL on malformed input)
#   [...] / {"k": v, ...} — array / object literals
parsed(S, V)   :- raw(S),               V = parse_json(S).
record(Id, V)  :- request(Id, M, P, _), V = {"method": M, "path": P}.
```

The toolkit:

- **Subscript / slice**: `V["key"]` (object), `V[i]` (array), `V[i:j]` (slice an array).
- **Iteration**: `object_entry(O, K, V)` walks an object value, `array_element(A, I, V)` walks an array value — both as body atoms.
- **Coercion / introspection**: `as_string`, `as_integer`, `as_float`, `as_boolean`, `length`, `type_of`. All return SQL `NULL` on shape mismatch, never raise.
- **Object projection / serialisation**: `keys(V)` and `values(V)` return sorted projections of an object's keys / values (`NULL` on non-object); `to_json(V)` serialises any value to its canonical JSON text — byte-for-byte identical across every backend, useful as a hash / dedup key.
- **Construction**: `parse_json` parses a string; array / object literals (`[1, X, ...]`, `{"k": V, ...}`) build composites directly. Primitives auto-lift wherever a `value` slot is expected — no explicit conversion function. The finiteness checker (`--warn-finiteness`) flags recursions that can manufacture an unbounded family of compounds through any of these constructors.
- **Equality**: `=`, `<>`, `==`, `!=` work via structural comparison; ordering operators are rejected at type-check (no portable cross-backend order on `value`).

Datamog maintains structural equality across every backend: PostgreSQL stores `value` as `JSONB` and gets canonicalisation natively; SQLite / sql.js store it as canonical `TEXT` (object keys sorted recursively, numbers normalised on insert) so textual equality coincides with structural; the in-memory evaluators canonicalise via the same function. The one v1 cross-backend variance is `parse_json` on SQLite / sql.js, which doesn't sort object keys — see the spec for details.

Two loaders feed `value` columns: JSONL with a single-`value`-column declaration consumes each line as one row; a standalone `<predicate>.json` file loads the whole file as one row. The [Working with values](doc/walkthrough/14-json.md) tutorial chapter walks through a complete example, and the [`json-events`](packages/cli/examples/json-events), [`json-config`](packages/cli/examples/json-config), and [`parse-json`](packages/cli/examples/parse-json) CLI examples are runnable end-to-end.

## Algebraic data types (proof terms)

Name a rule with `p(...)[Ctor]` and its predicate becomes an algebraic datatype: every derivation is recorded as a **proof term**, the constructor applied to its witnesses and sub-proofs. Read the Curry-Howard way — a predicate is a proposition, a named rule is a constructor, a proof term is an inhabitant — a named predicate *is* an ADT and its proof terms are the values.

```prolog
num(1). num(2).
num_list(0)[Nil].
num_list(n + 1)[Cons] :- num(Car), n <= 2, num_list(n).   # the proof terms ARE the lists

?- Xs : num_list(Len).                # capture the proof term; Len is its length index
```

Capture a proof with `V : p(...)` (or `V : p` to ignore the declared columns). A constructor term is always a **match** — on a side of a body equality, or as a head / body-atom argument — so list operations read like Prolog:

```prolog
append(Nil(), B, B) :- B : num_list.
append(Cons(H, T), B, Cons(H, R)) :- append(T, B, R).
```

A rule derives its proof term automatically, or lists the arguments explicitly with `[Ctor(a, b, ...)]` to keep an intermediate variable out. Because a constructor term matches an existing proof, operations relate values their predicate already enumerates. Runnable examples: [`proof-terms`](packages/cli/examples/proof-terms) (enums, pairs, lists), [`proof-term-fold`](packages/cli/examples/proof-term-fold) (a fold), [`peano`](packages/cli/examples/peano) (naturals), [`list-ops`](packages/cli/examples/list-ops) (append / reverse / member), and [`expr-eval`](packages/cli/examples/expr-eval) (a chart parser feeding an evaluator). The [Proof terms](doc/walkthrough/15-proof-terms.md) walkthrough chapter walks through it.

## Modules

A file is a function from its `input predicate`s to its outputs (`output predicate`s and the unnamed `?-` default). An input can be bound with `:=` to a source: a specific data file, or an instance of another module. Binding one file's inputs to another's outputs composes files, with no separate module construct.

```prolog
# reach.dl: reachability, parameterised by an edge relation
input predicate edge(src: integer, dst: integer).
output predicate reach(X, Y) :- edge(X, Y).
output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).

# main.dl: instantiate reach.dl twice against different relations
input predicate road(src: integer, dst: integer).                       # loads road.csv
input predicate flight(src: integer, dst: integer) := "flights.jsonl".  # explicit data file
input predicate road_reach(a: integer, b: integer)   := reach from "reach.dl"(edge = road).
input predicate flight_reach(a: integer, b: integer) := reach from "reach.dl"(edge = flight).
?- road_reach(1, X).
```

`from` marks a module binding (`<export> from "mod.dl"(input = pred, ...)`; omit the export to take the module's `?-` default output); a bare string is a data-file binding (`as csv` forces the loader when the extension does not say). `datamog main.dl` resolves imports from disk relative to the entry, instantiating each module (duplicated per use, freshened so instances never collide) and merging everything into one program. The instantiation graph must be acyclic, and boundary column types are checked. See [spec §9](doc/spec.md) for the full semantics.

## Packages

| Package | Description |
|---------|-------------|
| `datamog-parser` | Langium grammar, generated parser, and AST type definitions |
| `datamog-core` | Program analyzer (safety checking, dependency graph, recursion detection, type inference) |
| `datamog-engine` | SQL translator, executor, and pluggable loader interface |
| `datamog-backend-postgres` | Postgres backend (via `Bun.sql`) |
| `datamog-backend-sqlite` | SQLite backend (via `bun:sqlite`, in-memory by default) |
| `datamog-backend-sqljs` | sql.js backend (SQLite compiled to WASM via `sql.js`) |
| `datamog-backend-native` | Native in-memory backend that interprets Datalog directly via a naive evaluator (no SQL) |
| `datamog-backend-seminaive` | Seminaive in-memory evaluator — same observable semantics as `native` but with delta-aware iteration (no SQL) |
| `datamog-csv` | Loader plugin for CSV files |
| `datamog-jsonl` | Loader plugin for JSONL files |
| `datamog-json` | Loader plugin for whole-file JSON (single-row tables) |
| `datamog-gsheet` | Loader plugin for Google Sheets |
| `datamog-mermaid` | Loader plugin for Mermaid graph/flowchart files (`.mmd`) |
| `datamog-repl` | Incremental REPL session engine (declarations/rules/queries accumulate); drives the interactive CLI REPL and the `--repl --json` JSONL protocol |
| `datamog-cli` | Command-line interface |
| `datamog-playground` | Browser-based playground (Preact, CodeMirror, sql.js — no server needed) |
| `datamog-vscode` | VS Code extension with syntax highlighting and diagnostics |

## Playground

The playground is a browser-based IDE for Datamog — write programs, attach CSV/JSONL data or CORS-enabled CSV URLs, and run them entirely client-side. The full pipeline (parse → analyze → translate → execute) runs in a Web Worker; SQL execution uses sql.js (SQLite compiled to WASM) and the `native` / `seminaive` evaluators run directly in JS. No installation required.

**Try it online: [max-schaefer.github.io/datamog](https://max-schaefer.github.io/datamog/)**

Highlights:

- **CodeMirror editor** with syntax highlighting, jump-to-definition, recursive-call markers, and live diagnostics for parse errors, arity mismatches, unsafe variables, unstratifiable negation, and finiteness warnings.
- **Cycle visualiser**: when a non-stratifiable-negation or finiteness cycle is rejected, the squiggly carries a "Show cycle" action that opens a modal highlighting the participating predicates and rules.
- **Backend picker**: choose SQLite (executes via sql.js), `native` or `seminaive` (in-memory evaluators), or PostgreSQL (code-generation only — the generated SQL is shown but not executed).
- **Tabbed results**: query rows, generated SQL, a Mermaid dependency graph, and — for the in-memory evaluators — a step-through trace showing per-iteration tuples added in each stratum.
- **Data panel** for pasting CSV/JSONL data or fetching CORS-enabled CSV URLs per extensional predicate; the playground keeps the loaded rows in memory as the EDB.

A lightweight **embeddable** variant (`packages/playground/src/embed/`) turns the `datamog` code blocks in a Markdown tutorial into live, editable mini-playgrounds — it runs on the main thread with the pure-TS `native`/`seminaive` backend (no Web Worker, no WASM), so several can share one page. See [`doc/embed-tutorials/`](doc/embed-tutorials/README.md).

The playground is automatically deployed to GitHub Pages on every push to `main`.

```bash
bun run playground:dev    # start dev server
bun run playground:build  # production build (static files in packages/playground/dist/)
```

## Usage

Start the interactive REPL:

```bash
bun run datamog
```

Run with the CLI (no database setup needed — uses in-memory SQLite by default):

```bash
bun run datamog packages/cli/examples/family/family.dl
```

Or preview the generated SQL:

```bash
bun run datamog --dry-run packages/cli/examples/family/family.dl
```

Select a backend explicitly:

```bash
bun run datamog --backend sqlite packages/cli/examples/family/family.dl
bun run datamog --backend sqljs packages/cli/examples/family/family.dl
bun run datamog --backend native packages/cli/examples/family/family.dl
DATABASE_URL=postgres://localhost:5432/mydb bun run datamog --backend postgres program.dl
```

The `native` backend skips SQL entirely: it runs a naive bottom-up
evaluator over in-memory relations, which is slower than the SQL backends
for large programs but makes the Datalog semantics (stratum-by-stratum
fixed-point iteration, rule-body enumeration, stratified negation) easy
to trace step by step. `--dry-run` is not supported for this backend
since there's no SQL to print.

The CLI auto-discovers data files in the same directory as the `.dl` file (or the directory given by `--data-dir`): `<predicate>.csv`, `<predicate>.jsonl`, `<predicate>.json` (loaded as one row, requires a single `value` column), or `<predicate>.mmd` (Mermaid graph). You can override an individual input predicate `p` with a like-named flag `--p source` (placed after the program; a kebab flag like `--road-network` aliases the predicate `road_network`), or `--input name=source` for a name no flag can express, where `source` is a local file path, an HTTP(S) URL ending in `.csv`, `.jsonl`, `.json`, or `.mmd`, a Google Sheets URL — see the [datamog-gsheet README](packages/loader/gsheet/README.md) for Google Sheets setup instructions — or a GitHub shorthand `github:owner/repo/path` (`gh:` alias), which expands to a `raw.githubusercontent.com` URL with the ref defaulting to `HEAD` (pin a branch/tag/commit with a trailing `#ref`).

### Examples

The [`packages/cli/examples/`](packages/cli/examples/) directory holds 40+ runnable programs — transitive closure, stratified negation, aggregates, mutual recursion, classic puzzles, JSON/`value` handling, algebraic datatypes via proof terms, propositional logic, and Boolean-circuit solvers. Run any of them with:

```bash
bun run datamog packages/cli/examples/<name>/<name>.dl
```

Some use non-linear recursion (rejected by the SQL backends); those carry a `native-only` marker file and run on `--backend native` or `--backend seminaive`.

### Programmatic API

```ts
import { DatamogExecutor } from "datamog-engine";
import { CsvLoader } from "datamog-csv";
import { create as createBackend } from "datamog-backend-sqlite";

const backend = await createBackend();
const executor = new DatamogExecutor(backend, [
  new CsvLoader({ directory: "./data" }),
]);

const source = await Bun.file("family.dl").string();
const results = await executor.execute(source);

for (const result of results) {
  console.log(result.sql);
  console.table(result.rows);
}

await backend.close();
```

## VS Code Extension

The `datamog-vscode` package provides a VS Code extension with syntax highlighting, live parse-error diagnostics, and semantic validation (arity mismatches, unsafe variables, unstratifiable negation, etc.).

### Build and install

```bash
bun run build:vscode
code --install-extension packages/vscode-extension/datamog.vsix
```

For development, open the `packages/vscode-extension` folder in VS Code and press **F5** to launch an Extension Development Host with the extension loaded.

### Features

- Syntax highlighting for `.dl` files
- Live parse-error diagnostics (powered by the Langium parser)
- Semantic diagnostics from the Datamog analyzer (arity errors, safety violations, stratification errors, aggregate validation)
- Bracket matching and auto-closing for `()`, `[]`, and `""`
- Comment toggling with `#`

## Documentation

- [Language specification](doc/spec.md) — detailed reference covering syntax, semantics, type system, and SQL translation
- [Comparison with other Datalog systems](doc/comparison.md) — how Datamog relates to Soufflé, CodeQL, Datomic, DES, Flix, Datafrog, Z3, and others, by syntax, features, and implementation category
- [Language walkthrough](doc/walkthrough/README.md) — the long-form, feature-by-feature tutorial (chapters 00–14 plus appendices), with runnable code and exercises
- [Case studies](doc/case-studies/README.md) — a puzzle-driven companion tutorial that builds up end-to-end solutions to bigger problems
- [Jupyter notebook tutorial](doc/jupyter/README.md) — runnable `%%datamog` cells driven by the `datamog-magic` IPython magic, with pandas DataFrame binding
- [Embed tutorials](doc/embed-tutorials/README.md) — Markdown tutorials whose code blocks render as live, editable mini-playgrounds (deployed alongside the playground at `<site>/tutorial.html`)
- [FLOLAC 2026 course slides](https://max-schaefer.github.io/datamog/slides/) — *Introduction to Logic Programming with Datalog*, a full-page slide deck (Introduction plus four parts) deployed alongside the playground; source and handout/exam materials in [`doc/courses/flolac-26/`](doc/courses/flolac-26/)

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full local development guide.

```bash
bun install          # install dependencies
bun test             # run all tests
bun run typecheck    # tsc -b across the workspace (project references)
bun run e2e          # Playwright e2e suite for the playground (auto-installs Chromium on first run)
bun run check        # lint and format check (biome)
bun run check:fix    # auto-fix lint and format issues
```

### Tutorial slides

Per-chapter Marp decks live under `doc/walkthrough/slides/`. Build PDFs (gitignored) with:

```bash
bun run slides:build   # one-shot
bun run slides:watch   # rebuild on change
```

## License

[MIT](LICENSE) © 2026 Max Schaefer.

## Trademarks

The Datamog mascot is original art, a play on the Mercedes-Benz Unimog;
"Mercedes-Benz" and "Unimog" are trademarks of Mercedes-Benz Group AG. The
Part 1 course material uses Pokémon as a running example; "Pokémon" and Pokémon
names, types, moves, and abilities are trademarks of Nintendo, Creatures Inc.,
and GAME FREAK inc. All such marks are used only nominatively, for educational
illustration; this project is not affiliated with or endorsed by their owners.
