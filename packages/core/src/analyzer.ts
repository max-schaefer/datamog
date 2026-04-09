import type { ExtDecl, Program, Query, Rule } from "./ast.ts";

export class AnalyzerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyzerError";
  }
}

export interface AnalyzedProgram {
  extDecls: Map<string, ExtDecl>;
  rules: Map<string, Rule[]>;
  /** Arity of each predicate (EDB and IDB). */
  arities: Map<string, number>;
  queries: Query[];
  dependencies: Map<string, Set<string>>;
  recursivePredicates: Set<string>;
  /** Predicates grouped into strata (SCCs) in dependency order. */
  sortedStrata: string[][];
}

export function analyze(program: Program): AnalyzedProgram {
  const extDecls = new Map<string, ExtDecl>();
  const rules = new Map<string, Rule[]>();
  const arities = new Map<string, number>();
  const queries: Query[] = [];

  // Classify statements
  for (const stmt of program.statements) {
    switch (stmt.kind) {
      case "ext_decl":
        if (extDecls.has(stmt.predicate)) {
          throw new AnalyzerError(
            `Predicate '${stmt.predicate}' is declared as extensional multiple times`,
          );
        }
        extDecls.set(stmt.predicate, stmt);
        arities.set(stmt.predicate, stmt.columns.length);
        break;
      case "rule": {
        const existing = rules.get(stmt.head.predicate);
        if (existing) {
          const expectedArity = arities.get(stmt.head.predicate)!;
          if (stmt.head.args.length !== expectedArity) {
            throw new AnalyzerError(
              `Predicate '${stmt.head.predicate}' is defined with arity ${expectedArity} and ${stmt.head.args.length}`,
            );
          }
          existing.push(stmt);
        } else {
          rules.set(stmt.head.predicate, [stmt]);
          arities.set(stmt.head.predicate, stmt.head.args.length);
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
      throw new AnalyzerError(
        `Predicate '${predicate}' is declared as both extensional and intensional`,
      );
    }
  }

  // Check arity of atoms in rule bodies and queries
  function checkAtomArity(predicate: string, actual: number) {
    const expected = arities.get(predicate);
    if (expected !== undefined && actual !== expected) {
      throw new AnalyzerError(
        `Predicate '${predicate}' has arity ${expected} but is used with ${actual} arguments`,
      );
    }
  }

  for (const predicateRules of rules.values()) {
    for (const rule of predicateRules) {
      for (const atom of rule.body) {
        checkAtomArity(atom.predicate, atom.args.length);
      }
    }
  }

  for (const query of queries) {
    checkAtomArity(query.atom.predicate, query.atom.args.length);
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

  // Detect recursion: an SCC is recursive if it has >1 member or a self-loop
  const recursivePredicates = new Set<string>();
  for (const scc of sccs) {
    if (scc.length > 1) {
      for (const pred of scc) {
        recursivePredicates.add(pred);
      }
    } else {
      const pred = scc[0]!;
      const deps = dependencies.get(pred);
      if (deps?.has(pred)) {
        recursivePredicates.add(pred);
      }
    }
  }

  // Tarjan's outputs SCCs with dependencies before dependents
  const sortedStrata = sccs;

  return {
    extDecls,
    rules,
    arities,
    queries,
    dependencies,
    recursivePredicates,
    sortedStrata,
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
