# datamog-mermaid

Mermaid graph loader plugin for Datamog. Populates extensional predicate tables from [Mermaid](https://mermaid.js.org/) `graph`/`flowchart` diagram files.

## Usage

```ts
import { DatamogExecutor } from "datamog-engine";
import { MermaidLoader } from "datamog-mermaid";

const executor = new DatamogExecutor(backend, [
  new MermaidLoader({ directory: "./data" }),
]);
```

The loader looks for `<predicate>.mmd` in the configured directory (e.g. `data/edge.mmd` for an `extensional edge(...)` declaration). Predicates with 2 columns (source, target) or 3 columns (source, target, label) are supported. Edge labels are extracted from the `-->|label|` syntax; edges without labels get an empty string.

The loader parses a subset of Mermaid flowchart syntax (arrows, node shapes, `-->|label|` and `-- label -->` labels, chained edges). The `&` fan-out operator (`A & B --> C`) is not supported: such a line is skipped rather than expanded, so write the edges out individually.

## Examples

### Binary predicate (2 columns)

Given `edge.mmd`:

```
graph TD
    a --> b
    b --> c
    c --> d
```

and a Datamog declaration:

```
extensional edge(src: string, dst: string).
```

the loader produces rows `("a","b")`, `("b","c")`, `("c","d")`.

### Ternary predicate with edge labels (3 columns)

Given `road.mmd`:

```
graph TD
    castle -->|2| village
    castle -->|5| forest
    village -->|4| bridge
```

and a Datamog declaration:

```
extensional road(from: string, to: string, weight: string).
```

the loader produces rows `("castle","village","2")`, `("castle","forest","5")`, `("village","bridge","4")`.

## Parser

The Mermaid graph parser is also exported for standalone use:

```ts
import { parseMermaidGraph } from "datamog-mermaid";

const edges = parseMermaidGraph(mermaidSource);
// [{ source: "a", target: "b", label: "5" }, ...]
```
