import type { ExtDecl, Program, Query, Rule, Term } from "./ast.ts";

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
  /** Negative dependencies: predicate p negatively depends on q if some rule for p has `not q(...)` in its body. */
  negativeDependencies: Map<string, Set<string>>;
  recursivePredicates: Set<string>;
  /** Predicates grouped into strata (SCCs) in dependency order. */
  sortedStrata: string[][];
}

/** Collect all variable names from an expression tree. */
function collectVars(term: Term, into: Set<string>) {
  switch (term.kind) {
    case "variable":
      into.add(term.name);
      break;
    case "binary":
      collectVars(term.left, into);
      collectVars(term.right, into);
      break;
    case "unary":
      collectVars(term.operand, into);
      break;
    case "call":
      for (const arg of term.args) collectVars(arg, into);
      break;
    case "subscript":
      collectVars(term.object, into);
      collectVars(term.index, into);
      break;
    case "slice":
      collectVars(term.object, into);
      if (term.start) collectVars(term.start, into);
      if (term.end) collectVars(term.end, into);
      break;
  }
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
      for (const elem of rule.body) {
        if (elem.kind === "atom") {
          checkAtomArity(elem.predicate, elem.args.length);
        }
      }
    }
  }

  for (const query of queries) {
    checkAtomArity(query.atom.predicate, query.atom.args.length);
  }

  // Safety check
  for (const predicateRules of rules.values()) {
    for (const rule of predicateRules) {
      checkSafety(rule);
    }
  }

  // Build dependency graph (IDB predicates only), tracking positive and negative deps
  const dependencies = new Map<string, Set<string>>();
  const negativeDependencies = new Map<string, Set<string>>();
  for (const [predicate, predicateRules] of rules) {
    const deps = new Set<string>();
    const negDeps = new Set<string>();
    for (const rule of predicateRules) {
      for (const elem of rule.body) {
        if (elem.kind === "atom") {
          deps.add(elem.predicate);
          if (elem.negated) {
            negDeps.add(elem.predicate);
          }
        }
      }
    }
    dependencies.set(predicate, deps);
    negativeDependencies.set(predicate, negDeps);
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

  // Stratification check: no negation within an SCC
  const sccOf = new Map<string, Set<string>>();
  for (const scc of sccs) {
    const sccSet = new Set(scc);
    for (const pred of scc) {
      sccOf.set(pred, sccSet);
    }
  }

  for (const [predicate, negDeps] of negativeDependencies) {
    const myScc = sccOf.get(predicate);
    for (const dep of negDeps) {
      if (myScc?.has(dep)) {
        throw new AnalyzerError(
          `Negation of '${dep}' in rules for '${predicate}' is not stratifiable (they are mutually recursive)`,
        );
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
    negativeDependencies,
    sortedStrata,
    recursivePredicates,
  };
}

/**
 * Check safety of a rule:
 * - A variable is "safe" if it appears in a positive (unnegated) body atom argument,
 *   or it is the LHS of an equality whose RHS variables are all safe.
 * - Every variable in the head, in negated atoms, in equality RHS expressions,
 *   and in complex expressions in positive atom arguments must be safe.
 */
function checkSafety(rule: Rule) {
  // Phase 1: collect variables grounded by positive atoms
  const safeVars = new Set<string>();
  const equalities: { variable: string; exprVars: Set<string> }[] = [];

  for (const elem of rule.body) {
    if (elem.kind === "atom" && !elem.negated) {
      for (const arg of elem.args) {
        if (arg.kind === "variable") {
          safeVars.add(arg.name);
        }
      }
    } else if (elem.kind === "equality") {
      const exprVars = new Set<string>();
      collectVars(elem.expr, exprVars);
      equalities.push({ variable: elem.variable, exprVars });
    } else if (elem.kind === "range") {
      // If expr is a variable, it may be bound by the range (like an equality)
      if (elem.expr.kind === "variable") {
        const boundVars = new Set<string>();
        collectVars(elem.low, boundVars);
        collectVars(elem.high, boundVars);
        equalities.push({ variable: elem.expr.name, exprVars: boundVars });
      }
    }
  }

  // Phase 2: fixed-point — an equality X = expr makes X safe if all vars in expr are safe
  let changed = true;
  while (changed) {
    changed = false;
    for (const eq of equalities) {
      if (!safeVars.has(eq.variable)) {
        let allSafe = true;
        for (const v of eq.exprVars) {
          if (!safeVars.has(v)) {
            allSafe = false;
            break;
          }
        }
        if (allSafe) {
          safeVars.add(eq.variable);
          changed = true;
        }
      }
    }
  }

  function checkVarSafe(varName: string, context: string) {
    if (!safeVars.has(varName)) {
      throw new AnalyzerError(`Unsafe variable '${varName}' in ${context}`);
    }
  }

  function checkTermSafe(term: Term, context: string) {
    const vars = new Set<string>();
    collectVars(term, vars);
    for (const v of vars) {
      checkVarSafe(v, context);
    }
  }

  // Check head variables
  for (const arg of rule.head.args) {
    checkTermSafe(arg, `head of rule for '${rule.head.predicate}'`);
  }

  // Check negated atom variables
  for (const elem of rule.body) {
    if (elem.kind === "atom" && elem.negated) {
      for (const arg of elem.args) {
        checkTermSafe(arg, `'not ${elem.predicate}(...)'`);
      }
    }
  }

  // Check equality RHS variables
  for (const eq of equalities) {
    for (const v of eq.exprVars) {
      checkVarSafe(v, `equality '${eq.variable} = ...'`);
    }
  }

  // Check complex expressions in positive atom arguments
  for (const elem of rule.body) {
    if (elem.kind === "atom" && !elem.negated) {
      for (const arg of elem.args) {
        if (arg.kind !== "variable") {
          checkTermSafe(arg, `argument of '${elem.predicate}(...)'`);
        }
      }
    }
  }

  // Check comparison variables
  for (const elem of rule.body) {
    if (elem.kind === "comparison") {
      checkTermSafe(elem.left, "comparison");
      checkTermSafe(elem.right, "comparison");
    }
  }

  // Check range atom variables
  for (const elem of rule.body) {
    if (elem.kind === "range") {
      checkTermSafe(elem.low, "range lower bound");
      checkTermSafe(elem.high, "range upper bound");
      if (elem.expr.kind !== "variable") {
        checkTermSafe(elem.expr, "range expression");
      }
    }
  }
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
