export interface Example {
  name: string;
  description: string;
  source: string;
  csvData?: Record<string, string>;
}

interface ExampleMeta {
  /**
   * Directory name under `packages/cli/examples/`. The `.dl` file is
   * expected to share the same basename as the directory.
   */
  dir: string;
  name: string;
  description: string;
  /**
   * CSV data to provide to the in-browser loader, overriding whatever the
   * CLI example dir ships with. Use this when the CLI example's native data
   * is in a format the playground loader doesn't understand (e.g. Mermaid).
   */
  csvDataOverride?: Record<string, string>;
}

// Pull the `.dl` source and any `.csv` data files from the CLI example tree
// at build time, so the playground never has to carry a second copy of the
// example code.
const dlFiles = import.meta.glob("../../../cli/examples/*/*.dl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const csvFiles = import.meta.glob("../../../cli/examples/*/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function csvsFor(dir: string): Record<string, string> | undefined {
  const prefix = `../../../cli/examples/${dir}/`;
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(csvFiles)) {
    if (!path.startsWith(prefix) || !path.endsWith(".csv")) continue;
    const predicate = path.slice(prefix.length, -".csv".length);
    out[predicate] = content;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function loadExample(meta: ExampleMeta): Example {
  const dlKey = `../../../cli/examples/${meta.dir}/${meta.dir}.dl`;
  const source = dlFiles[dlKey];
  if (source === undefined) {
    throw new Error(`Missing CLI example source at ${dlKey}`);
  }
  return {
    name: meta.name,
    description: meta.description,
    source,
    csvData: meta.csvDataOverride ?? csvsFor(meta.dir),
  };
}

const metas: ExampleMeta[] = [
  {
    dir: "family",
    name: "Family",
    description: "Ancestor relation via transitive closure (recursive, with CSV data)",
    // The CLI's family example loads parent.mmd (a Mermaid diagram); the
    // in-browser loader only handles CSV, so mirror the relation here.
    csvDataOverride: {
      parent: `name,child
alice,bob
alice,carol
bob,dave
bob,eve`,
    },
  },
  {
    dir: "fibonacci",
    name: "Fibonacci",
    description: "First 10 Fibonacci numbers using linear recursion and arithmetic",
  },
  {
    dir: "primes",
    name: "Primes",
    description: "Sieve of Eratosthenes using ranges, negation, and arithmetic",
  },
  {
    dir: "river-crossing",
    name: "River Crossing",
    description: "Farmer, wolf, goat, and cabbage puzzle",
  },
  {
    dir: "aggregates",
    name: "Aggregates",
    description: "Aggregate functions (count, sum, avg, min, max) on student scores",
  },
  {
    dir: "shortest-path",
    name: "Shortest Path",
    description: "Shortest path in a weighted graph using min aggregate",
  },
  {
    dir: "reflexive-tc",
    name: "Reflexive TC",
    description: "Reflexive transitive closure of a directed graph",
  },
  {
    dir: "transitive-closure",
    name: "Transitive Closure",
    description: "Linear vs quadratic formulation — why SQL only handles one",
  },
  {
    dir: "shannon-entropy",
    name: "Shannon Entropy",
    description: "Character-frequency entropy of a string, using ranges and aggregates",
  },
  {
    dir: "find-the-thief",
    name: "Find the Thief",
    description: "Logic puzzle: use clues to identify a suspect from 20 villagers",
  },
];

export const examples: Example[] = metas.map(loadExample);
