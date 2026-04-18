import { AnalyzerError } from "./analyzer.ts";
import type { AnalyzedProgram } from "./analyzer.ts";
import type { HeadTerm, RangeAtom, SqlType } from "./ast.ts";
import { isRealLiteral } from "./ast.ts";

export interface TypedProgram extends AnalyzedProgram {
  /** Column types for every predicate (EDB and IDB). */
  columnTypes: Map<string, SqlType[]>;
}

/**
 * Infer column types for all predicates.
 *
 * EDB types are known from declarations. IDB types are inferred by tracing
 * rule head arguments back to their sources via variable bindings and
 * expression type rules. Uses a fixed-point iteration for recursive predicates.
 */
export function inferTypes(analyzed: AnalyzedProgram): TypedProgram {
  // Internal representation allows undefined for unknown positions
  const types = new Map<string, (SqlType | undefined)[]>();

  // Seed EDB types from declarations
  for (const [predicate, decl] of analyzed.extDecls) {
    types.set(
      predicate,
      decl.columns.map((c) => c.type),
    );
  }

  // Initialize IDB types — seed from facts (empty body rules) where possible
  for (const [predicate, rules] of analyzed.rules) {
    const arity = analyzed.arities.get(predicate)!;
    const seedTypes: (SqlType | undefined)[] = new Array(arity).fill(undefined);

    for (const rule of rules) {
      if (rule.body.length === 0) {
        for (let i = 0; i < rule.head.args.length; i++) {
          const arg = rule.head.args[i]!;
          if (arg.$type === "StringLiteral") seedTypes[i] = joinTypes(seedTypes[i], "text");
          else if (arg.$type === "NumberLiteral")
            seedTypes[i] = joinTypes(
              seedTypes[i],
              isRealLiteral(arg) || !Number.isInteger(arg.value) ? "real" : "integer",
            );
        }
      }
    }

    types.set(predicate, seedTypes);
  }

  // Fixed-point iteration: infer types from rules until stable
  let changed = true;
  while (changed) {
    changed = false;
    for (const stratum of analyzed.sortedStrata) {
      for (const predicate of stratum) {
        const rules = analyzed.rules.get(predicate);
        if (!rules) continue;

        const arity = analyzed.arities.get(predicate)!;
        const newTypes: (SqlType | undefined)[] = new Array(arity).fill(undefined);

        for (const rule of rules) {
          // Build variable type environment from body atoms
          const varTypes = new Map<string, SqlType>();

          for (const elem of rule.body) {
            if (elem.$type === "Atom" && !elem.negated) {
              const predTypes = types.get(elem.predicate);
              if (!predTypes) continue;
              for (let j = 0; j < elem.args.length; j++) {
                const arg = elem.args[j]!;
                if (arg.$type === "Variable" && !varTypes.has(arg.name)) {
                  const colType = predTypes[j];
                  if (colType) {
                    varTypes.set(arg.name, colType);
                  }
                }
              }
            } else if (elem.$type === "Equality") {
              const exprType = inferTermType(elem.expr, varTypes, types);
              if (exprType) {
                varTypes.set(elem.variable, exprType);
              }
            } else if (elem.$type === "RangeAtom") {
              if (elem.expr.$type === "Variable" && !varTypes.has(elem.expr.name)) {
                // Infer type from bounds
                const lowType = inferTermType(elem.low, varTypes, types);
                const highType = inferTermType(elem.high, varTypes, types);
                const rangeType =
                  lowType && highType ? joinTypes(lowType, highType) : (lowType ?? highType);
                if (rangeType) {
                  varTypes.set(elem.expr.name, rangeType);
                }
              }
            }
          }

          // Infer head argument types
          for (let i = 0; i < rule.head.args.length; i++) {
            const arg = rule.head.args[i]!;
            const argType = inferTermType(arg, varTypes, types);
            if (argType) {
              newTypes[i] = joinTypes(newTypes[i], argType);
            }
          }
        }

        // Merge new types with old, check for changes
        const oldTypes = types.get(predicate)!;
        for (let i = 0; i < arity; i++) {
          const merged = newTypes[i] ?? oldTypes[i];
          if (merged !== oldTypes[i]) {
            changed = true;
          }
          oldTypes[i] = merged;
        }
      }
    }
  }

  // Validate range atom types
  validateRangeTypes(analyzed, types);

  // Finalize: convert undefined to "text" as default
  const columnTypes = new Map<string, SqlType[]>();
  for (const [pred, predTypes] of types) {
    columnTypes.set(
      pred,
      predTypes.map((t) => t ?? "text"),
    );
  }

  return { ...analyzed, columnTypes };
}

function isNumericType(t: SqlType | undefined): boolean {
  return t === "integer" || t === "real";
}

/** Validate that range atom expressions have numeric types. */
function validateRangeTypes(
  analyzed: AnalyzedProgram,
  types: Map<string, (SqlType | undefined)[]>,
): void {
  for (const [, predicateRules] of analyzed.rules) {
    for (const rule of predicateRules) {
      // Rebuild variable type environment for this rule
      const varTypes = new Map<string, SqlType>();
      for (const elem of rule.body) {
        if (elem.$type === "Atom" && !elem.negated) {
          const predTypes = types.get(elem.predicate);
          if (!predTypes) continue;
          for (let j = 0; j < elem.args.length; j++) {
            const arg = elem.args[j]!;
            if (arg.$type === "Variable" && !varTypes.has(arg.name)) {
              const colType = predTypes[j];
              if (colType) varTypes.set(arg.name, colType);
            }
          }
        } else if (elem.$type === "Equality") {
          const exprType = inferTermType(elem.expr, varTypes, types);
          if (exprType) varTypes.set(elem.variable, exprType);
        } else if (elem.$type === "RangeAtom") {
          if (elem.expr.$type === "Variable" && !varTypes.has(elem.expr.name)) {
            const lowType = inferTermType(elem.low, varTypes, types);
            const highType = inferTermType(elem.high, varTypes, types);
            const rangeType =
              lowType && highType ? joinTypes(lowType, highType) : (lowType ?? highType);
            if (rangeType) varTypes.set(elem.expr.name, rangeType);
          }
        }
      }

      // Check range atoms
      for (const elem of rule.body) {
        if (elem.$type === "RangeAtom") {
          checkRangeExprTypes(elem, varTypes, types);
        }
      }
    }
  }
}

function checkRangeExprTypes(
  range: RangeAtom,
  varTypes: Map<string, SqlType>,
  types: Map<string, (SqlType | undefined)[]>,
): void {
  const lowType = inferTermType(range.low, varTypes, types);
  const highType = inferTermType(range.high, varTypes, types);
  const exprType = inferTermType(range.expr, varTypes, types);

  if (lowType && !isNumericType(lowType)) {
    const cst = range.low.$cstNode;
    throw new AnalyzerError(`Range lower bound has non-numeric type '${lowType}'`, cst?.offset, cst?.end);
  }
  if (highType && !isNumericType(highType)) {
    const cst = range.high.$cstNode;
    throw new AnalyzerError(`Range upper bound has non-numeric type '${highType}'`, cst?.offset, cst?.end);
  }
  if (exprType && !isNumericType(exprType)) {
    const cst = range.expr.$cstNode;
    throw new AnalyzerError(`Range expression has non-numeric type '${exprType}'`, cst?.offset, cst?.end);
  }
}

/** Infer the type of a term expression given variable types and predicate column types. */
function inferTermType(
  term: HeadTerm,
  varTypes: Map<string, SqlType>,
  types: Map<string, (SqlType | undefined)[]>,
): SqlType | undefined {
  switch (term.$type) {
    case "StringLiteral":
      return "text";
    case "NumberLiteral":
      return isRealLiteral(term) || !Number.isInteger(term.value) ? "real" : "integer";
    case "Variable":
      return varTypes.get(term.name);
    case "BinaryExpr": {
      const leftType = inferTermType(term.left, varTypes, types);
      const rightType = inferTermType(term.right, varTypes, types);
      if (term.op === "+" && (leftType === "text" || rightType === "text")) {
        return "text";
      }
      return numericResultType(leftType, rightType, term.op);
    }
    case "UnaryExpr":
      return inferTermType(term.operand, varTypes, types);
    case "FunctionCall":
      return inferCallType(term.name);
    case "AggregateCall":
      return inferAggregateType(term.func, term.arg, varTypes, types);
    case "Subscript":
      return "text";
    case "Slice":
      return "text";
  }
}

/** Return type of a built-in function call. */
function inferCallType(name: string): SqlType | undefined {
  switch (name) {
    case "len":
      return "integer";
    default:
      return undefined;
  }
}

/** Return type of an aggregate function call. */
function inferAggregateType(
  func: string,
  arg: HeadTerm,
  varTypes: Map<string, SqlType>,
  types: Map<string, (SqlType | undefined)[]>,
): SqlType | undefined {
  switch (func) {
    case "count":
      return "integer";
    case "sum": {
      const argType = inferTermType(arg, varTypes, types);
      return argType === "real" ? "real" : "integer";
    }
    case "avg":
      return "real";
    case "min":
    case "max":
      return inferTermType(arg, varTypes, types);
    case "group_concat":
      return "text";
    default:
      return undefined;
  }
}

/** Determine the result type of an arithmetic operation. */
function numericResultType(
  left: SqlType | undefined,
  right: SqlType | undefined,
  op: string,
): SqlType | undefined {
  if (op === "/" || op === "%") {
    if (left === "real" || right === "real") return "real";
    if (left === "integer" && right === "integer") return "integer";
    return left ?? right;
  }
  if (left === "real" || right === "real") return "real";
  if (left === "integer" || right === "integer") return "integer";
  return left ?? right;
}

/** Join two types across multiple rules: widen to the more general type. */
function joinTypes(a: SqlType | undefined, b: SqlType): SqlType {
  if (!a) return b;
  if (a === b) return a;
  if (a === "text" || b === "text") return "text";
  if ((a === "real" && b === "integer") || (a === "integer" && b === "real")) return "real";
  return a;
}
