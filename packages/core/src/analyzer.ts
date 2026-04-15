import type { Atom, ExtDecl, HeadTerm, Program, Query, Rule } from "./ast.ts";

const AGGREGATE_NAMES = new Set(["count", "sum", "avg", "min", "max", "group_concat"]);

export class AnalyzerError extends Error {
  /** Byte offset of the error in the source (undefined if position unavailable). */
  offset?: number;
  /** Byte end-offset of the error in the source. */
  end?: number;

  constructor(message: string, offset?: number, end?: number) {
    super(message);
    this.name = "AnalyzerError";
    this.offset = offset;
    this.end = end;
  }
}

/** Extract byte-offset range from a Langium AST node's CST node. */
function nodePos(node: { $cstNode?: { offset: number; end: number } }): [number, number] | undefined {
  return node.$cstNode ? [node.$cstNode.offset, node.$cstNode.end] : undefined;
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
  /** Predicates that are non-linearly recursive (some rule has >1 body atom from the same SCC). */
  nonLinearPredicates: Set<string>;
  /** Predicates grouped into strata (SCCs) in dependency order. */
  sortedStrata: string[][];
}

/** Collect all variable names from an expression tree. */
function collectVars(term: HeadTerm, into: Set<string>) {
  switch (term.$type) {
    case "Variable":
      into.add(term.name);
      break;
    case "BinaryExpr":
      collectVars(term.left, into);
      collectVars(term.right, into);
      break;
    case "UnaryExpr":
      collectVars(term.operand, into);
      break;
    case "FunctionCall":
      for (const arg of term.args) collectVars(arg, into);
      break;
    case "AggregateCall":
      collectVars(term.arg, into);
      break;
    case "Subscript":
      collectVars(term.object, into);
      collectVars(term.index, into);
      break;
    case "Slice":
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
    switch (stmt.$type) {
      case "ExtDecl":
        if (extDecls.has(stmt.predicate)) {
          const pos = nodePos(stmt);
          throw new AnalyzerError(
            `Predicate '${stmt.predicate}' is declared as extensional multiple times`,
            ...pos ?? [],
          );
        }
        extDecls.set(stmt.predicate, stmt);
        arities.set(stmt.predicate, stmt.columns.length);
        break;
      case "Rule": {
        const existing = rules.get(stmt.head.predicate);
        if (existing) {
          const expectedArity = arities.get(stmt.head.predicate)!;
          if (stmt.head.args.length !== expectedArity) {
            const pos = nodePos(stmt.head);
            throw new AnalyzerError(
              `Predicate '${stmt.head.predicate}' is defined with arity ${expectedArity} and ${stmt.head.args.length}`,
              ...pos ?? [],
            );
          }
          existing.push(stmt);
        } else {
          rules.set(stmt.head.predicate, [stmt]);
          arities.set(stmt.head.predicate, stmt.head.args.length);
        }
        break;
      }
      case "Query":
        queries.push(stmt);
        break;
    }
  }

  // Check no predicate is both EDB and IDB
  for (const predicate of rules.keys()) {
    if (extDecls.has(predicate)) {
      const pos = nodePos(rules.get(predicate)![0]!.head);
      throw new AnalyzerError(
        `Predicate '${predicate}' is declared as both extensional and intensional`,
        ...pos ?? [],
      );
    }
  }

  // Check no predicate uses an aggregate function name
  for (const predicate of [...extDecls.keys(), ...rules.keys()]) {
    if (AGGREGATE_NAMES.has(predicate)) {
      const decl = extDecls.get(predicate) ?? rules.get(predicate)?.[0];
      const pos = decl ? nodePos(decl) : undefined;
      throw new AnalyzerError(
        `Predicate name '${predicate}' conflicts with aggregate function '${predicate}'`,
        ...pos ?? [],
      );
    }
  }

  // Check arity of atoms in rule bodies and queries
  function checkAtom(atom: Atom) {
    const expected = arities.get(atom.predicate);
    const pos = nodePos(atom);
    if (expected === undefined) {
      throw new AnalyzerError(`Predicate '${atom.predicate}' is not defined`, ...pos ?? []);
    }
    if (atom.args.length !== expected) {
      throw new AnalyzerError(
        `Predicate '${atom.predicate}' has arity ${expected} but is used with ${atom.args.length} arguments`,
        ...pos ?? [],
      );
    }
  }

  for (const predicateRules of rules.values()) {
    for (const rule of predicateRules) {
      for (const elem of rule.body) {
        if (elem.$type === "Atom") {
          checkAtom(elem);
        }
      }
    }
  }

  for (const query of queries) {
    checkAtom(query.atom);
  }

  // Safety check
  for (const predicateRules of rules.values()) {
    for (const rule of predicateRules) {
      checkSafety(rule);
    }
  }

  // Validate aggregate rules
  for (const [predicate, predicateRules] of rules) {
    const hasAggregate = predicateRules.some((r) => r.head.args.some((a) => containsAggregate(a)));
    if (!hasAggregate) continue;

    for (const rule of predicateRules) {
      // All rules must be aggregate rules
      const ruleHasAgg = rule.head.args.some((a) => containsAggregate(a));
      if (!ruleHasAgg) {
        const pos = nodePos(rule.head);
        throw new AnalyzerError(
          `Predicate '${predicate}' has both aggregate and non-aggregate rules`,
          ...pos ?? [],
        );
      }
      for (const arg of rule.head.args) {
        if (arg.$type === "AggregateCall") {
          // No nested aggregates
          if (containsAggregate(arg.arg)) {
            const pos = nodePos(arg);
            throw new AnalyzerError(
              `Nested aggregate in head of rule for '${predicate}'`,
              ...pos ?? [],
            );
          }
        } else if (containsAggregate(arg)) {
          // Aggregate must be top-level, not embedded in an expression
          const pos = nodePos(arg);
          throw new AnalyzerError(
            `Aggregate must be a top-level head argument in rule for '${predicate}'`,
            ...pos ?? [],
          );
        }
      }
    }

    // All rules must agree on which positions are aggregate vs grouping
    const firstRule = predicateRules[0]!;
    const aggPositions = firstRule.head.args.map((a) => a.$type === "AggregateCall");
    for (let r = 1; r < predicateRules.length; r++) {
      const rule = predicateRules[r]!;
      for (let i = 0; i < rule.head.args.length; i++) {
        if ((rule.head.args[i]!.$type === "AggregateCall") !== aggPositions[i]) {
          const pos = nodePos(rule.head);
          throw new AnalyzerError(
            `Rules for '${predicate}' disagree on which head positions are aggregates`,
            ...pos ?? [],
          );
        }
      }
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
        if (elem.$type === "Atom") {
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

  // Detect non-linear recursion: a rule is non-linear if its body has >1 atom
  // referring to predicates in the same SCC. All predicates in such an SCC are
  // marked non-linear because they share the same recursive evaluation.
  const nonLinearPredicates = new Set<string>();
  for (const scc of sccs) {
    const sccSet = new Set(scc);
    if (!scc.some((p) => recursivePredicates.has(p))) continue;
    let isNonLinear = false;
    for (const pred of scc) {
      const predRules = rules.get(pred);
      if (!predRules) continue;
      for (const rule of predRules) {
        let sccAtomCount = 0;
        for (const elem of rule.body) {
          if (elem.$type === "Atom" && !elem.negated && sccSet.has(elem.predicate)) {
            sccAtomCount++;
          }
        }
        if (sccAtomCount > 1) {
          isNonLinear = true;
          break;
        }
      }
      if (isNonLinear) break;
    }
    if (isNonLinear) {
      for (const pred of scc) {
        nonLinearPredicates.add(pred);
      }
    }
  }

  // Aggregate predicates cannot be recursive
  for (const pred of recursivePredicates) {
    const predRules = rules.get(pred);
    const aggRule = predRules?.find((r) => r.head.args.some((a) => a.$type === "AggregateCall"));
    if (aggRule) {
      const pos = nodePos(aggRule.head);
      throw new AnalyzerError(
        `Aggregate predicate '${pred}' cannot be recursive`,
        ...pos ?? [],
      );
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
        // Find the negated atom for a precise error location
        let errPos: [number, number] | undefined;
        for (const rule of rules.get(predicate) ?? []) {
          for (const elem of rule.body) {
            if (elem.$type === "Atom" && elem.negated && elem.predicate === dep) {
              errPos = nodePos(elem);
              break;
            }
          }
          if (errPos) break;
        }
        throw new AnalyzerError(
          `Negation of '${dep}' in rules for '${predicate}' is not stratifiable (they are mutually recursive)`,
          ...errPos ?? [],
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
    nonLinearPredicates,
  };
}

/** Check whether a term contains any aggregate call. */
function containsAggregate(term: HeadTerm): boolean {
  switch (term.$type) {
    case "AggregateCall":
      return true;
    case "BinaryExpr":
      return containsAggregate(term.left) || containsAggregate(term.right);
    case "UnaryExpr":
      return containsAggregate(term.operand);
    case "FunctionCall":
      return AGGREGATE_NAMES.has(term.name) || term.args.some(containsAggregate);
    case "Subscript":
      return containsAggregate(term.object) || containsAggregate(term.index);
    case "Slice":
      return (
        containsAggregate(term.object) ||
        (term.start !== undefined && containsAggregate(term.start)) ||
        (term.end !== undefined && containsAggregate(term.end))
      );
    default:
      return false;
  }
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
    if (elem.$type === "Atom" && !elem.negated) {
      for (const arg of elem.args) {
        if (arg.$type === "Variable") {
          safeVars.add(arg.name);
        }
      }
    } else if (elem.$type === "Equality") {
      const exprVars = new Set<string>();
      collectVars(elem.expr, exprVars);
      equalities.push({ variable: elem.variable, exprVars });
    } else if (elem.$type === "RangeAtom") {
      // If expr is a variable, it may be bound by the range (like an equality)
      if (elem.expr.$type === "Variable") {
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

  function checkTermSafe(term: HeadTerm, context: string) {
    const vars = new Set<string>();
    collectVars(term, vars);
    for (const v of vars) {
      if (!safeVars.has(v)) {
        const pos = nodePos(term);
        throw new AnalyzerError(`Unsafe variable '${v}' in ${context}`, ...pos ?? []);
      }
    }
  }

  // Check head variables
  for (const arg of rule.head.args) {
    if (arg.$type === "AggregateCall") {
      // For count(_), allow anonymous variables (they translate to COUNT(*))
      if (arg.func === "count" && arg.arg.$type === "Variable" && arg.arg.name.startsWith("_")) {
        continue;
      }
      checkTermSafe(arg.arg, `aggregate in head of rule for '${rule.head.predicate}'`);
    } else {
      checkTermSafe(arg, `head of rule for '${rule.head.predicate}'`);
    }
  }

  // Check body elements left-to-right
  for (const elem of rule.body) {
    switch (elem.$type) {
      case "Atom":
        if (elem.negated) {
          for (const arg of elem.args) {
            checkTermSafe(arg, `'not ${elem.predicate}(...)'`);
          }
        } else {
          for (const arg of elem.args) {
            if (arg.$type !== "Variable") {
              checkTermSafe(arg, `argument of '${elem.predicate}(...)'`);
            }
          }
        }
        break;
      case "Equality":
        checkTermSafe(elem.expr, `equality '${elem.variable} = ...'`);
        break;
      case "Comparison":
        checkTermSafe(elem.left, "comparison");
        checkTermSafe(elem.right, "comparison");
        break;
      case "RangeAtom":
        checkTermSafe(elem.low, "range lower bound");
        checkTermSafe(elem.high, "range upper bound");
        if (elem.expr.$type !== "Variable") {
          checkTermSafe(elem.expr, "range expression");
        }
        break;
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
