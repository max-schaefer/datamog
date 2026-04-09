import type { AnalyzedProgram } from "./analyzer.ts";
import type { SqlType, Term } from "./ast.ts";

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
  const columnTypes = new Map<string, SqlType[]>();

  // Seed EDB types from declarations
  for (const [predicate, decl] of analyzed.extDecls) {
    columnTypes.set(
      predicate,
      decl.columns.map((c) => c.type),
    );
  }

  // Initialize IDB types as unknown (null), then iterate to fixed point
  for (const [predicate, rules] of analyzed.rules) {
    const arity = analyzed.arities.get(predicate)!;
    columnTypes.set(predicate, new Array<SqlType>(arity).fill("text")); // placeholder
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
            if (elem.kind === "atom" && !elem.negated) {
              const predTypes = columnTypes.get(elem.predicate);
              if (!predTypes) continue;
              for (let j = 0; j < elem.args.length; j++) {
                const arg = elem.args[j]!;
                if (arg.kind === "variable" && !varTypes.has(arg.name)) {
                  const colType = predTypes[j];
                  if (colType) {
                    varTypes.set(arg.name, colType);
                  }
                }
              }
            } else if (elem.kind === "equality") {
              const exprType = inferTermType(elem.expr, varTypes, columnTypes);
              if (exprType) {
                varTypes.set(elem.variable, exprType);
              }
            }
          }

          // Infer head argument types
          for (let i = 0; i < rule.head.args.length; i++) {
            const arg = rule.head.args[i]!;
            const argType = inferTermType(arg, varTypes, columnTypes);
            if (argType) {
              newTypes[i] = joinTypes(newTypes[i], argType);
            }
          }
        }

        // Check if types changed
        const oldTypes = columnTypes.get(predicate)!;
        const finalTypes = newTypes.map((t, i) => t ?? oldTypes[i]!);
        for (let i = 0; i < arity; i++) {
          if (finalTypes[i] !== oldTypes[i]) {
            changed = true;
          }
        }
        columnTypes.set(predicate, finalTypes);
      }
    }
  }

  return { ...analyzed, columnTypes };
}

/** Infer the type of a term expression given variable types and predicate column types. */
function inferTermType(
  term: Term,
  varTypes: Map<string, SqlType>,
  columnTypes: Map<string, SqlType[]>,
): SqlType | undefined {
  switch (term.kind) {
    case "string":
      return "text";
    case "number":
      return Number.isInteger(term.value) ? "integer" : "real";
    case "variable":
      return varTypes.get(term.name);
    case "binary": {
      const leftType = inferTermType(term.left, varTypes, columnTypes);
      const rightType = inferTermType(term.right, varTypes, columnTypes);
      if (term.op === "+" && (leftType === "text" || rightType === "text")) {
        return "text";
      }
      return numericResultType(leftType, rightType, term.op);
    }
    case "unary":
      return inferTermType(term.operand, varTypes, columnTypes);
  }
}

/** Determine the result type of an arithmetic operation. */
function numericResultType(
  left: SqlType | undefined,
  right: SqlType | undefined,
  op: string,
): SqlType | undefined {
  if (op === "/" || op === "%") {
    // Division may produce real, but integer/integer in SQL stays integer
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
  // text + anything = text (string coercion dominates)
  if (a === "text" || b === "text") return "text";
  // real + integer = real
  if ((a === "real" && b === "integer") || (a === "integer" && b === "real")) return "real";
  return a;
}
