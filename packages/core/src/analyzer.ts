import type { ExtDecl, Program, Query, Rule } from "./ast.ts";

export interface AnalyzedProgram {
  extDecls: Map<string, ExtDecl>;
  rules: Map<string, Rule[]>;
  queries: Query[];
  dependencies: Map<string, Set<string>>;
  recursivePredicates: Set<string>;
  sortedPredicates: string[];
}

export function analyze(program: Program): AnalyzedProgram {
  const extDecls = new Map<string, ExtDecl>();
  const rules = new Map<string, Rule[]>();
  const queries: Query[] = [];

  // Classify statements
  for (const stmt of program.statements) {
    switch (stmt.kind) {
      case "ext_decl":
        extDecls.set(stmt.predicate, stmt);
        break;
      case "rule": {
        const existing = rules.get(stmt.head.predicate);
        if (existing) {
          existing.push(stmt);
        } else {
          rules.set(stmt.head.predicate, [stmt]);
        }
        break;
      }
      case "query":
        queries.push(stmt);
        break;
    }
  }

  // Check no predicate is both EDB and IDB
  for (const predicate of rules.keys()) {
    if (extDecls.has(predicate)) {
      throw new Error(`Predicate '${predicate}' is declared as both extensional and intensional`);
    }
  }

  // Build dependency graph (IDB predicates only)
  const dependencies = new Map<string, Set<string>>();
  for (const [predicate, predicateRules] of rules) {
    const deps = new Set<string>();
    for (const rule of predicateRules) {
      for (const atom of rule.body) {
        deps.add(atom.predicate);
      }
    }
    dependencies.set(predicate, deps);
  }

  // Find SCCs using Tarjan's algorithm
  const sccs = tarjanSCC(rules, dependencies);

  // Detect recursion
  const recursivePredicates = new Set<string>();
  for (const scc of sccs) {
    if (scc.length > 1) {
      throw new Error(`Mutual recursion is not supported (predicates: ${scc.join(", ")})`);
    }
    const pred = scc[0]!;
    const deps = dependencies.get(pred);
    if (deps?.has(pred)) {
      recursivePredicates.add(pred);
    }
  }

  // Tarjan's outputs SCCs with dependencies before dependents
  const sortedPredicates = sccs.map((scc) => scc[0]!);

  return {
    extDecls,
    rules,
    queries,
    dependencies,
    recursivePredicates,
    sortedPredicates,
  };
}

function tarjanSCC(rules: Map<string, Rule[]>, dependencies: Map<string, Set<string>>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const deps = dependencies.get(v) ?? new Set();
    for (const w of deps) {
      // Only consider IDB predicates (those that have rules)
      if (!rules.has(w)) continue;

      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const v of rules.keys()) {
    if (!indices.has(v)) {
      strongconnect(v);
    }
  }

  return sccs;
}
