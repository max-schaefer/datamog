import { isExtDecl, isFunctionCall, isLiteral, isRule } from "datamog-parser";
import type { Program, Statement } from "./ast.ts";

export interface ExpandOptions {
  /**
   * Per-instance prefix for the module's private and output predicates and its
   * proof constructors, e.g. `"road_reach$"`. Two instantiations of the same
   * module must use different prefixes so their names (and constructors) do not
   * collide in the merged program.
   */
  prefix: string;
  /**
   * Actuals for the module's inputs: a map from an `input predicate` name to
   * the predicate in the importer's scope it is wired to. Inputs absent from
   * this map stay free (their declaration is kept and they become EDBs of the
   * merged program).
   */
  inputs: Record<string, string>;
  /**
   * The importer's selected output. `export` names one of the module's output
   * predicates (or private predicates, though only outputs are meaningful to
   * import); it is renamed to `as` (the importer's local name for the instance)
   * instead of being freshened with `prefix`, so the importer's existing
   * references resolve without an alias rule. Every other predicate is still
   * prefix-freshened.
   */
  exportAs?: { export: string; as: string };
}

/** Yield a node and every descendant AST node (children found by walking
 *  non-`$` properties; `$type`/`$container`/`$cstNode` etc. are skipped). */
function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (!node || typeof node !== "object" || !("$type" in node)) return;
  const n = node as Record<string, unknown>;
  yield n;
  for (const key of Object.keys(n)) {
    if (key.startsWith("$")) continue;
    const value = n[key];
    if (Array.isArray(value)) {
      for (const el of value) yield* walk(el);
    } else {
      yield* walk(value);
    }
  }
}

/**
 * Expand one instantiation of a module, in place, and return the statements to
 * merge into the importer's program. Runs on a **raw** (pre-post-process) AST
 * (see `parseRaw`), so proof terms are still `[Ctor]` / `Ctor(...)` rather than
 * lowered onto `value`.
 *
 * Per the functor design (`doc/design/imports-as-functors.md`):
 *
 * - **Substitute** each wired input predicate with the actual name the importer
 *   supplied, everywhere it is referenced; free inputs keep their name.
 * - **Freshen** every private and output predicate name, and every proof
 *   constructor, with `prefix`, so two instances do not collide with each other
 *   or with the importer (the constructor freshening keeps the merged program's
 *   global constructor-uniqueness check honest).
 * - **Drop** the declarations of wired inputs (they are supplied from outside);
 *   keep free-input declarations as EDBs.
 *
 * The caller passes a fresh raw parse per instantiation, so mutating in place is
 * safe. The importer binds its chosen name to the instance's selected output
 * (`${prefix}${outputName}`); that wiring is the resolver's job, not this pass.
 */
export function expandModule(
  module: Program,
  { prefix, inputs, exportAs }: ExpandOptions,
): Statement[] {
  const localNames = new Set<string>();
  const ctorNames = new Set<string>();
  for (const stmt of module.statements) {
    if (isRule(stmt)) {
      localNames.add(stmt.head.predicate);
      if (stmt.ruleName !== undefined) ctorNames.add(stmt.ruleName);
    }
  }

  const renamePredicate = (name: string): string => {
    if (Object.hasOwn(inputs, name)) return inputs[name]!;
    if (exportAs && name === exportAs.export) return exportAs.as;
    if (localNames.has(name)) return `${prefix}${name}`;
    return name; // free input or built-in body atom
  };
  const renameConstructor = (name: string): string =>
    ctorNames.has(name) ? `${prefix}${name}` : name;

  for (const stmt of module.statements) {
    for (const node of walk(stmt)) {
      if (isRule(node)) {
        node.head.predicate = renamePredicate(node.head.predicate);
        if (node.ruleName !== undefined) node.ruleName = renameConstructor(node.ruleName);
      } else if (isLiteral(node)) {
        node.predicate = renamePredicate(node.predicate);
      } else if (isFunctionCall(node) && ctorNames.has(node.name)) {
        // A constructor term `Ctor(...)` (a match), distinguished from a
        // built-in call by membership in the module's constructor set.
        node.name = renameConstructor(node.name);
      }
    }
  }

  // Wired inputs are supplied by the importer, so drop their declarations;
  // free inputs stay as EDB declarations with their names unchanged.
  return module.statements.filter((s) => !(isExtDecl(s) && Object.hasOwn(inputs, s.predicate)));
}
