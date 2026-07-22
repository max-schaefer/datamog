# Design proposal: modules as functors (inputs and outputs)

Status: proposal, partly implemented. The grammar (the `:=` source binding on
input predicates), the per-instance expansion (`expandModule`), and a first-cut
elaborator (`elaborate`: the entry's own bindings, named exports only) exist.
Still to come: nested module imports and the acyclicity check, selecting a
module's unnamed default output, boundary type-checking, the Bun file resolver,
CLI wiring, and per-instance diagnostics. A `:=` binding that reaches analysis
(i.e. one the elaborator did not handle) is rejected.

This is the ambitious alternative to the conservative module system in
[`imports.md`](./imports.md). Read that one first for the baseline; this doc
only states where it differs and why.

The core move: a Datamog program is a **function from input relations to output
relations**. Its inputs are its extensional predicates; its outputs are its
queries. Running it at the CLI instantiates the inputs (from CSV, by
convention) and prints the output. Loading it as a **module** instantiates the
inputs by wiring them to other predicates, and exposes the outputs for the
importer to use. That is exactly a parameterised module (an ML functor whose
parameters are relations, or a Soufflé component), reached by re-reading the two
things the language already has rather than adding a separate construct.

## Decisions baked in

Carried over from the discussion:

1. Named outputs are intensional predicates marked for export: a rule-style head
   with variable arguments and inferred types (`output predicate reach(X, Y) :-
   ...`), so they read like the intensionals they are. Only the single unnamed
   default output keeps query-style implicit projection. Column types are not
   declared on an output; the type contract at an import boundary lives on the
   receiving `input predicate`, checked against the output's inferred types.
2. **At most one unnamed query per file**, always (not only on import). Extra
   outputs must be named. This breaks programs that use several `?-` queries;
   there are no external clients, so the migration is ours alone.
3. Actuals passed to a module are **just predicate names**. (An input can still
   be bound directly to a data file with `:= "file"` — but that is a binding on
   the input itself, not an actual flowing into a module; actuals stay predicate
   names.)
4. Instantiating a module always **duplicates** it (expansion / monomorphisation).
   No sharing of instances in the first version.
5. Composition is by **expansion** (inline), not materialise-feed. Importing a
   module substitutes actuals for its inputs, freshens its private names per
   instance, and merges everything into one program with one global least fixed
   point (see *Semantics*).

## The interface of a module

A module (a file) has three interface elements:

```prolog
# reach.dl: generic reachability, parameterised by an edge relation
input predicate edge(src: integer, dst: integer).

output predicate reach(X, Y) :- edge(X, Y).
output predicate reach(X, Z) :- reach(X, Y), edge(Y, Z).
```

- **`input predicate P(cols).`** declares a parameter, with column types. It is
  supplied from outside the module's rules: at the CLI from `P.csv` in the
  module's own directory (per the conservative doc's decision 1), from a source
  bound with `:=` (see *Instantiation and wiring*), or, when the module is
  imported, by an actual the importer wires in. The `input predicate` keyword
  names that role directly: supplied from outside these rules, rather than
  table-backed.
- **`output predicate Head :- body.`** marks a rule as defining a named export.
  The head is rule-style (a predicate name and variable arguments, no declared
  types), so an output reads exactly like the intensional it is; a predicate is
  an output if any of its rules carries the marker. Types are inferred, as for
  any derived predicate.
- **The unnamed default output** is a single `?- body.` query. It keeps
  implicit projection (distinct non-anonymous variables, first-mention order).
  It is what prints at the CLI and what an importer gets when it does not name a
  specific output. It is optional: a pure library has only `output predicate`s
  and no `?-`.

Predicates that are neither `input` nor `output` are private to the module.
Encapsulation is implicit: you expose a predicate by declaring it an output, and
keep it private by not.

## Instantiation and wiring

An input predicate may be **bound** to a source with `:=` (a pun on `:-`: `:-`
means "defined by rules", `:=` means "bound to a source"). The binding is either
a data file or a module instantiation. The single rule: **`from` present means a
module; a bare string means a data file.**

```prolog
# main.dl
input predicate road(src: integer, dst: integer).       # leaf input, from road.csv
input predicate flight(src: integer, dst: integer).      # leaf input, from flight.csv

# an explicit data file, forcing the loader when the extension lies
input predicate airport(code: string, name: string) := "data/airports.tsv" as csv.

# instantiate reach.dl twice, wiring its `edge` input to two different relations
input predicate road_reach(src: integer, dst: integer)   := reach from "reach.dl"(edge = road).
input predicate flight_reach(src: integer, dst: integer) := reach from "reach.dl"(edge = flight).

?- road_reach(1, X).
```

Reading the right-hand side:

- A **bare string** (`:= "data/airports.tsv"`) is a data file, resolved relative
  to the importing file; the loader is chosen by extension, or forced with `as
  <format>` (`csv`, `jsonl`, `json`, `mermaid`, ...) when the extension does not
  or cannot say. This is the explicit form of the CLI's `P.csv`-by-convention
  default.
- **`reach from "reach.dl"`** is a module instantiation: `"reach.dl"` is a module
  reference (resolved relative to the importing file) and `reach` selects a named
  output. Omit the export name (`:= from "reach.dl"(...)`) to take the module's
  unnamed default output; the local name (`road_reach`) renames whatever is
  selected.
- **`(edge = road)`** supplies actuals for the callee's inputs by name
  (`moduleInput = localPredicate`). `road` is a predicate in `main.dl`'s scope
  (here a leaf input; it could equally be a derived predicate or another
  instantiation's result). This is decision 3: the only thing that flows across
  the boundary as an actual is a predicate name.

An input with a module default reads like a local binding but stays a parameter:
an importer of `main.dl` may override `road_reach` by wiring its own predicate,
or leave it and get the default instance. (A non-overridable, private "fixed"
import is a later refinement; the first version makes every import an overridable
default. See *Deferred*.)

Column types on the receiving declaration (`road_reach(src: integer, dst:
integer)`) must match the selected output's signature, and each actual's columns
must match the callee input's declared types. The existing type machinery checks
both at the boundary. The receiving types could later be inferred from the
selected output instead of restated, but declaring them keeps the interface
explicit.

## Semantics: expansion

Elaboration turns the whole import graph into one flat program, which the
existing analyze / translate / evaluate pipeline then runs unchanged.

```mermaid
graph TD
  entry["entry file"] --> parse["parse each referenced module (raw)"]
  parse --> graph["build instantiation graph from input defaults + overrides"]
  graph --> acyclic["check the instantiation graph is acyclic"]
  acyclic --> expand["per instantiation: copy module, substitute inputs, freshen private names + constructors"]
  expand --> merge["merge all expanded rules into one Program"]
  merge --> post["post-process merged program (global checks)"]
  post --> analyze["analyze + inferTypes + translate/evaluate (existing pipeline)"]
```

Per instantiation:

1. Take a fresh copy of the module's private and output predicates.
2. **Substitute** each input predicate with the actual predicate name the
   importer supplied (or, recursively, the input's own default). Inputs are not
   renamed; they resolve to predicates in the importer's scope.
3. **Freshen** every private and output predicate name with a per-instance prefix
   (for example `road_reach$reach`), so two instances do not collide with each
   other or with the importer's names. The importer's chosen name binds to the
   instance's selected output.
4. **Freshen proof-constructor names** the same way. This is the interaction
   between decisions 2 and 4: a module that declares an ADT constructor,
   instantiated twice, would otherwise produce two `Foo` constructors and trip
   the merged program's global constructor-uniqueness check. Per-instance
   freshening keeps that check honest.

After expansion, the transitive **free inputs** (those with no module default,
at the leaves) are the merged program's EDBs, loaded from CSV relative to their
owning module's directory. Everything derived is IDB. The chosen output is the
query. So the merged program is an ordinary single-file Datamog program, and the
backends need no functor-specific code.

Free inputs, unlike private and output predicates, are **not** freshened per
instance: they keep their bare name. So two instances of the same module share
one EDB (its bundled data, the same for every instance), and a free input
collides by name with an importer predicate spelled the same. This is the
deliberate reading (a free input is the module's own data dependency); wire an
input as an actual when you want a per-instance relation instead.

## Consequences and limitations

State these plainly; they are the cost of expansion.

- **The instantiation graph must be acyclic.** Keep two graphs apart. The
  *predicate-dependency* graph (which predicate's rules mention which) may cycle
  freely; those cycles are recursion, resolved by the least fixed point over the
  expanded program. The *instantiation* graph (to build a copy of module A I
  must first build a copy of module B, because an input of A defaults to an
  instance of B) must not cycle. Expansion is not idempotent: each instantiation
  is a fresh copy (decision 4), so a cycle among instantiations spawns copies
  without end, and instantiation is static and data-independent, so there is no
  base case to stop it. Recursion *within* a module is therefore fine; recursion
  *across* a wiring cycle (A takes an input from B while B takes an input from A)
  is rejected. The practical rule: mutually recursive predicates must live in the
  same module. This is the one real expressiveness loss against the conservative
  merge design, whose merge-by-name is idempotent (include-once) and so tolerates
  cyclic imports and cross-file recursion; it is an acceptable trade for
  parameterisation and reuse in a teaching tool. The check is cycle detection
  over the reachable, post-override instantiation graph, so a default that points
  into a cycle but is always overridden before it fires is not flagged.
- **Always duplicate.** Two instantiations with the same actuals are still
  expanded twice, producing duplicate generated SQL (template bloat). Correct,
  just not minimal. Sharing identical instances is a later optimisation
  (decision 4).
- **One unnamed query per file, enforced always.** A file with two `?-` queries
  is an error. Programs in `packages/cli/examples` that use several queries (27
  of 50 today) must move their extra queries to `output predicate`s. That
  migration is future work, not part of this proposal.
- **Diagnostics carry an instantiation path.** As in the conservative doc, each
  merged statement needs to trace back to its source module and position. Here it
  also needs the instantiation it came from, so an error in a module used twice
  can name which use triggered it. Slightly more plumbing than the single-file
  merge, same shape.

## CLI behaviour

`datamog main.dl` treats `main.dl` as the root module:

- Its free inputs (`road`, `flight`) load from `road.csv` / `flight.csv` in
  `main.dl`'s directory, or via `--road` / `--flight` input-flag overrides
  (`--input name=source` for names no flag can express).
- Its single unnamed `?-` output prints.
- Named `output predicate`s can be requested with a flag (for example
  `--output road_reach`); this is the CLI's equivalent of selecting a named
  export. Exact flag left open.

## Relation to the conservative design

The two are different composition models, not nested:

- Conservative (`imports.md`) shares predicates **by name** and merges, so a
  reference to an imported `path` is the same relation everywhere. Cross-file
  recursion is free; there is no parameterisation.
- This design **wires** inputs to outputs and expands, so a module can be reused
  with different inputs. Parameterisation and reuse are native; cross-file
  recursion via imports is not allowed.

For the common case (an acyclic import graph, modules with no free parameters,
one output taken per import) the two produce the same results. This design earns
its keep exactly when a module has free inputs and is reused, which is use case 2
from the conservative doc, delivered as the native model instead of a bolt-on.

## Touch points by package

Beyond the conservative doc's list (grammar, keywords, resolver, per-module
diagnostics, per-module EDB directories):

- **parser / keywords**: the `input predicate` / `output predicate` declaration
  forms and the `:=` source binding on inputs (`[export] from "path"(actual =
  pred, ...)` for a module, a bare string with optional `as <format>` for a data
  file). `input`, `output`, `predicate`, `from`, and `as` are contextual
  keywords. (Done.)
- **core**: `expandModule` does the per-instance expansion (substitute inputs,
  freshen private + output + constructor names, rename the selected output to the
  importer's local name via `exportAs`). `elaborate` drives it for the entry's
  own bindings and collects data-file bindings as a `DataSource[]`; it takes a
  `ModuleResolver` callback so it stays free of filesystem access. (Both done.)
  Still to come around `elaborate`: recursing into referenced modules (nested
  imports), the instantiation-graph acyclicity check, and default-output
  selection.
- **engine**: the executor gains the expansion pass ahead of the existing
  pipeline; free inputs become the merged program's EDBs. No backend changes.
- **cli**: root-module instantiation, input overrides, `--output` selection.
- **type checking**: wiring checks at each boundary (actual vs callee input;
  selected output vs receiving declaration), reusing existing column-type unify.

## Deferred

- **Fixed / private imports** (a module-backed binding that is not part of the
  module's parameter surface). The first version makes every import an
  overridable input default.
- **Sharing identical instances** (decision 4 starts with always-duplicate).
- **Inferring receiving column types** from the selected output signature instead
  of restating them.
- **Aliased whole-module access** (`import g = "mod.dl"(...)` then `g.a`, `g.b`).
  The first version selects one output per import site with `.name`.
- REPL, playground, and VS Code wiring, as in the conservative doc.
