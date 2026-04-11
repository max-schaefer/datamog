import type { AnalyzedProgram, Atom, Comparison, Rule, SqlType, Term } from "datamog-core";

export type Dialect = "postgres" | "sqlite";

export interface TranslateOptions {
  dialect?: Dialect;
}

export interface TranslationResult {
  createTables: string[];
  createViews: string[];
  queries: string[];
}

export function translate(
  analyzed: AnalyzedProgram,
  options: TranslateOptions = {},
): TranslationResult {
  const dialect = options.dialect ?? "postgres";
  const createTables = translateTables(analyzed);
  const createViews = translateViews(analyzed, dialect);
  const queries = translateQueries(analyzed);
  return { createTables, createViews, queries };
}

// --- Tables ---

const SQL_TYPE_MAP: Record<string, string> = {
  text: "TEXT",
  integer: "INTEGER",
  real: "REAL",
  boolean: "BOOLEAN",
};

function translateTables(analyzed: AnalyzedProgram): string[] {
  const tables: string[] = [];
  for (const decl of analyzed.extDecls.values()) {
    const cols = decl.columns.map((c) => `  ${ident(c.name)} ${SQL_TYPE_MAP[c.type]} NOT NULL`);
    tables.push(`CREATE TABLE IF NOT EXISTS ${ident(decl.predicate)} (\n${cols.join(",\n")}\n);`);
  }
  return tables;
}

// --- Views ---

function translateViews(analyzed: AnalyzedProgram, dialect: Dialect): string[] {
  const views: string[] = [];
  for (const stratum of analyzed.sortedStrata) {
    const isRecursive = analyzed.recursivePredicates.has(stratum[0]!);

    if (!isRecursive) {
      const predicate = stratum[0]!;
      const rules = analyzed.rules.get(predicate)!;
      const ruleQueries = rules.map((rule) =>
        translateRule(rule, analyzed, undefined, undefined, dialect),
      );
      const unionBody = ruleQueries.join("\n  UNION\n");

      if (dialect === "sqlite") {
        views.push(`CREATE VIEW IF NOT EXISTS ${ident(predicate)} AS\n  ${unionBody}\n;`);
      } else {
        views.push(`CREATE OR REPLACE VIEW ${ident(predicate)} AS\n  ${unionBody}\n;`);
      }
    } else if (stratum.length === 1) {
      const predicate = stratum[0]!;
      const rules = analyzed.rules.get(predicate)!;
      const arity = analyzed.arities.get(predicate)!;
      const ruleQueries = rules.map((rule) =>
        translateRule(rule, analyzed, undefined, undefined, dialect),
      );
      const unionBody = ruleQueries.join("\n  UNION\n");
      const colNames = colList(arity);

      if (dialect === "sqlite") {
        views.push(
          `CREATE VIEW IF NOT EXISTS ${ident(predicate)} AS\n  WITH RECURSIVE ${ident(predicate)}(${colNames}) AS (\n  ${unionBody}\n  )\n  SELECT * FROM ${ident(predicate)}\n;`,
        );
      } else {
        views.push(
          `CREATE RECURSIVE VIEW ${ident(predicate)} (${colNames}) AS (\n  ${unionBody}\n);`,
        );
      }
    } else {
      if (dialect === "sqlite") {
        // SQLite does not support mutually recursive CTEs. We merge all
        // predicates in the SCC into a single self-recursive CTE with a
        // discriminator tag column, then create views that filter by tag.
        const maxArity = Math.max(...stratum.map((p) => analyzed.arities.get(p)!));
        const combinedName = `__mutual_${stratum.join("_")}`;
        const combinedCols = `__tag, ${colList(maxArity)}`;

        // Build UNION of all rules, each tagged with its predicate name.
        // References to sibling predicates in the SCC are rewritten to
        // query the combined CTE with a tag filter.
        const renameMap = new Map(stratum.map((p) => [p, combinedName]));
        const tagMap = new Map(stratum.map((p) => [p, p]));

        // SQLite requires non-recursive (base) terms before recursive terms
        // in a WITH RECURSIVE UNION, so we partition rules into base cases
        // (facts / rules that don't reference the SCC) and recursive cases.
        const stratumSet = new Set(stratum);
        const baseParts: string[] = [];
        const recParts: string[] = [];
        for (const predicate of stratum) {
          const rules = analyzed.rules.get(predicate)!;
          const arity = analyzed.arities.get(predicate)!;
          const padding = maxArity - arity;
          const nullPad = padding > 0 ? `, ${Array(padding).fill("NULL").join(", ")}` : "";

          for (const rule of rules) {
            const isRecursive =
              rule.body.length > 0 &&
              rule.body.some(
                (elem) => elem.kind === "atom" && !elem.negated && stratumSet.has(elem.predicate),
              );
            const ruleSql = translateRule(rule, analyzed, renameMap, tagMap, dialect);
            const part = `SELECT '${predicate}' AS __tag, ${ruleSql.replace(/^SELECT /, "")}${nullPad}`;
            if (isRecursive) {
              recParts.push(part);
            } else {
              baseParts.push(part);
            }
          }
        }
        const unionParts = [...baseParts, ...recParts];

        const unionBody = unionParts.join("\n    UNION\n  ");
        const withBlock = `WITH RECURSIVE ${ident(combinedName)}(${combinedCols}) AS (\n  ${unionBody}\n  )`;

        for (const predicate of stratum) {
          const arity = analyzed.arities.get(predicate)!;
          const selectCols = colList(arity);
          views.push(
            `CREATE VIEW IF NOT EXISTS ${ident(predicate)} AS\n  ${withBlock}\n  SELECT ${selectCols} FROM ${ident(combinedName)} WHERE __tag = '${predicate}'\n;`,
          );
        }
      } else {
        const cteParts = stratum.map((predicate) => {
          const rules = analyzed.rules.get(predicate)!;
          const arity = analyzed.arities.get(predicate)!;
          const ruleQueries = rules.map((rule) =>
            translateRule(rule, analyzed, undefined, undefined, dialect),
          );
          const unionBody = ruleQueries.join("\n    UNION\n  ");
          const colNames = colList(arity);
          return `  ${ident(predicate)}(${colNames}) AS (\n  ${unionBody}\n  )`;
        });
        const withBlock = `WITH RECURSIVE\n${cteParts.join(",\n")}`;

        for (const predicate of stratum) {
          views.push(
            `CREATE OR REPLACE VIEW ${ident(predicate)} AS\n  ${withBlock}\n  SELECT * FROM ${ident(predicate)}\n;`,
          );
        }
      }
    }
  }
  return views;
}

/** Variable binding: either a column reference or an SQL expression (from equality). */
type Binding = { kind: "col"; alias: string; col: string } | { kind: "expr"; sql: string };

/**
 * Translate a single rule to a SQL SELECT statement.
 * @param renameMap - Optional map from predicate name to table/CTE name (for SQLite mutual recursion)
 * @param tagMap - Optional map from predicate name to tag value (for SQLite combined CTE discrimination)
 * @param dialect - SQL dialect (defaults to "postgres")
 */
function translateRule(
  rule: Rule,
  analyzed: AnalyzedProgram,
  renameMap?: Map<string, string>,
  tagMap?: Map<string, string>,
  dialect: Dialect = "postgres",
): string {
  if (rule.body.length === 0) {
    return translateFact(rule);
  }

  // Single left-to-right pass: categorize body elements and register bindings in order.
  const positiveAtoms: { atom: Atom; index: number }[] = [];
  const negatedAtoms: { atom: Atom }[] = [];
  const comparisons: Comparison[] = [];
  const bindingRanges: { alias: string; lowSql: string; highSql: string }[] = [];
  const filterRanges: { exprSql: string; lowSql: string; highSql: string }[] = [];

  const aliases = rule.body.map((_, i) => `__b${i}`);
  const bindings = new Map<string, Binding[]>();
  const varTypes = new Map<string, SqlType>();
  const columnTypes = (analyzed as { columnTypes?: Map<string, SqlType[]> }).columnTypes;
  let rangeCounter = 0;

  for (let i = 0; i < rule.body.length; i++) {
    const elem = rule.body[i]!;
    switch (elem.kind) {
      case "atom": {
        if (elem.negated) {
          negatedAtoms.push({ atom: elem });
        } else {
          const alias = aliases[i]!;
          const predTypes = columnTypes?.get(elem.predicate);
          for (let j = 0; j < elem.args.length; j++) {
            const term = elem.args[j]!;
            if (term.kind === "variable") {
              const col = resolveColumnRef(elem.predicate, j, analyzed);
              const list = bindings.get(term.name) ?? [];
              list.push({ kind: "col", alias, col });
              bindings.set(term.name, list);
              if (predTypes?.[j] && !varTypes.has(term.name)) {
                varTypes.set(term.name, predTypes[j]!);
              }
            }
          }
          positiveAtoms.push({ atom: elem, index: i });
        }
        break;
      }
      case "range": {
        const lowSql = termToSql(elem.low, bindings, varTypes);
        const highSql = termToSql(elem.high, bindings, varTypes);
        if (
          elem.expr.kind === "variable" &&
          isIntegerTerm(elem.low, varTypes) &&
          isIntegerTerm(elem.high, varTypes)
        ) {
          const rangeAlias = `__range_${rangeCounter++}`;
          const list = bindings.get(elem.expr.name) ?? [];
          list.push({ kind: "col", alias: rangeAlias, col: "value" });
          bindings.set(elem.expr.name, list);
          bindingRanges.push({ alias: rangeAlias, lowSql, highSql });
        } else {
          filterRanges.push({
            exprSql: termToSql(elem.expr, bindings, varTypes),
            lowSql,
            highSql,
          });
        }
        break;
      }
      case "equality": {
        const sql = termToSql(elem.expr, bindings, varTypes);
        const list = bindings.get(elem.variable) ?? [];
        list.push({ kind: "expr", sql });
        bindings.set(elem.variable, list);
        break;
      }
      case "comparison":
        comparisons.push(elem);
        break;
    }
  }

  // Helper: resolve a binding to SQL
  function bindingToSql(b: Binding): string {
    return b.kind === "col" ? `${b.alias}.${ident(b.col)}` : b.sql;
  }

  // SELECT clause
  const selectParts: string[] = [];
  for (let i = 0; i < rule.head.args.length; i++) {
    const term = rule.head.args[i]!;
    const targetCol = `col${i + 1}`;
    if (term.kind === "variable") {
      const refs = bindings.get(term.name);
      if (!refs || refs.length === 0) {
        throw new Error(
          `Unbound variable '${term.name}' in head of rule for '${rule.head.predicate}'`,
        );
      }
      selectParts.push(`${bindingToSql(refs[0]!)} AS ${targetCol}`);
    } else {
      selectParts.push(`${termToSql(term, bindings, varTypes)} AS ${targetCol}`);
    }
  }

  // FROM clause: positive atoms + binding ranges
  const fromParts = positiveAtoms.map(
    ({ atom, index }) =>
      `${ident(renameMap?.get(atom.predicate) ?? atom.predicate)} AS ${aliases[index]}`,
  );
  for (const { alias, lowSql, highSql } of bindingRanges) {
    if (dialect === "postgres") {
      fromParts.push(`generate_series(${lowSql}, ${highSql}) AS ${alias}("value")`);
    } else {
      // SQLite: use a recursive CTE subquery to generate integers, then
      // filter with WHERE conditions for the actual (possibly correlated) bounds.
      const gen = `__gen_${alias}`;
      fromParts.push(
        `(WITH RECURSIVE ${gen}("value") AS (SELECT 0 AS "value" UNION ALL SELECT "value" + 1 FROM ${gen} WHERE "value" < 10000) SELECT "value" FROM ${gen}) AS ${alias}`,
      );
    }
  }

  // WHERE conditions
  const conditions: string[] = [];

  // Join conditions from shared variables
  for (const [, refs] of bindings) {
    if (refs.length < 2) continue;
    const first = refs[0]!;
    for (let i = 1; i < refs.length; i++) {
      conditions.push(`${bindingToSql(first)} = ${bindingToSql(refs[i]!)}`);
    }
  }

  // SQLite range bound conditions (Postgres uses generate_series directly)
  if (dialect === "sqlite") {
    for (const { alias, lowSql, highSql } of bindingRanges) {
      conditions.push(`${alias}."value" >= ${lowSql}`);
      conditions.push(`${alias}."value" <= ${highSql}`);
    }
  }

  // Tag filter conditions for combined mutual-recursion CTE
  if (tagMap) {
    for (const { atom, index } of positiveAtoms) {
      const tag = tagMap.get(atom.predicate);
      if (tag) {
        conditions.push(`${aliases[index]}."__tag" = '${tag}'`);
      }
    }
  }

  // Non-variable argument conditions for positive atoms
  for (const { atom, index } of positiveAtoms) {
    const alias = aliases[index]!;
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      if (term.kind !== "variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        conditions.push(`${alias}.${ident(col)} = ${termToSql(term, bindings, varTypes)}`);
      }
    }
  }

  // NOT EXISTS subqueries for negated atoms
  for (const { atom } of negatedAtoms) {
    const subConditions: string[] = [];
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      const col = resolveColumnRef(atom.predicate, j, analyzed);
      if (term.kind === "variable") {
        const refs = bindings.get(term.name);
        if (refs && refs.length > 0) {
          subConditions.push(`${ident(col)} = ${bindingToSql(refs[0]!)}`);
        }
      } else {
        subConditions.push(`${ident(col)} = ${termToSql(term, bindings, varTypes)}`);
      }
    }
    const tag = tagMap?.get(atom.predicate);
    if (tag) {
      subConditions.push(`"__tag" = '${tag}'`);
    }
    let subquery = `SELECT 1 FROM ${ident(renameMap?.get(atom.predicate) ?? atom.predicate)}`;
    if (subConditions.length > 0) {
      subquery += ` WHERE ${subConditions.join(" AND ")}`;
    }
    conditions.push(`NOT EXISTS (${subquery})`);
  }

  // Comparison conditions
  for (const cmp of comparisons) {
    const sqlOp = cmp.op === "!=" ? "<>" : cmp.op;
    conditions.push(
      `${termToSql(cmp.left, bindings, varTypes)} ${sqlOp} ${termToSql(cmp.right, bindings, varTypes)}`,
    );
  }

  // Filter range conditions (non-binding ranges)
  for (const { exprSql, lowSql, highSql } of filterRanges) {
    conditions.push(`${exprSql} BETWEEN ${lowSql} AND ${highSql}`);
  }

  let sql = `SELECT ${selectParts.join(", ")} FROM ${fromParts.join(", ")}`;
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }
  return sql;
}

function translateFact(rule: Rule): string {
  const emptyBindings = new Map<string, Binding[]>();
  const selectParts = rule.head.args.map(
    (term, i) => `${termToSql(term, emptyBindings)} AS col${i + 1}`,
  );
  return `SELECT ${selectParts.join(", ")}`;
}

// --- Queries ---

function translateQueries(analyzed: AnalyzedProgram): string[] {
  const emptyBindings = new Map<string, Binding[]>();
  return analyzed.queries.map((query) => {
    const atom = query.atom;
    const isIDB = analyzed.rules.has(atom.predicate);

    const selectParts: string[] = [];
    const conditions: string[] = [];

    for (let i = 0; i < atom.args.length; i++) {
      const term = atom.args[i]!;
      const col = isIDB ? `col${i + 1}` : resolveColumnRef(atom.predicate, i, analyzed);

      if (term.kind === "variable") {
        selectParts.push(`${ident(col)} AS ${ident(term.name)}`);
      } else {
        conditions.push(`${ident(col)} = ${termToSql(term, emptyBindings)}`);
      }
    }

    if (selectParts.length === 0) {
      selectParts.push("*");
    }

    let sql = `SELECT ${selectParts.join(", ")} FROM ${ident(atom.predicate)}`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }
    sql += ";";
    return sql;
  });
}

// --- Helpers ---

function resolveColumnRef(predicate: string, argIndex: number, analyzed: AnalyzedProgram): string {
  const extDecl = analyzed.extDecls.get(predicate);
  if (extDecl) {
    return extDecl.columns[argIndex]!.name;
  }
  return `col${argIndex + 1}`;
}

function ident(name: string): string {
  return `"${name}"`;
}

/**
 * Convert a Term AST node to a SQL expression string.
 * @param varTypes - Optional variable type map for type-aware operator selection (+ vs ||)
 */
function termToSql(
  term: Term,
  bindings: Map<string, Binding[]>,
  varTypes?: Map<string, SqlType>,
): string {
  switch (term.kind) {
    case "string":
      return `'${term.value.replace(/'/g, "''")}'`;
    case "number":
      return String(term.value);
    case "variable": {
      const refs = bindings.get(term.name);
      if (!refs || refs.length === 0) {
        throw new Error(`Unbound variable '${term.name}'`);
      }
      const b = refs[0]!;
      return b.kind === "col" ? `${b.alias}.${ident(b.col)}` : b.sql;
    }
    case "binary": {
      const leftSql = termToSql(term.left, bindings, varTypes);
      const rightSql = termToSql(term.right, bindings, varTypes);
      let op = term.op;
      if (op === "+" && (isTextType(term.left, varTypes) || isTextType(term.right, varTypes))) {
        op = "||" as typeof op;
      }
      return `(${leftSql} ${op} ${rightSql})`;
    }
    case "unary":
      return `(-${termToSql(term.operand, bindings, varTypes)})`;
    case "call":
      return translateCall(term.name, term.args, bindings, varTypes);
    case "subscript": {
      const obj = termToSql(term.object, bindings, varTypes);
      const idx = termToSql(term.index, bindings, varTypes);
      return `SUBSTR(${obj}, (${idx}) + 1, 1)`;
    }
    case "slice": {
      const obj = termToSql(term.object, bindings, varTypes);
      if (term.start && term.end) {
        const s = termToSql(term.start, bindings, varTypes);
        const e = termToSql(term.end, bindings, varTypes);
        return `SUBSTR(${obj}, (${s}) + 1, (${e}) - (${s}))`;
      }
      if (term.start) {
        const s = termToSql(term.start, bindings, varTypes);
        return `SUBSTR(${obj}, (${s}) + 1)`;
      }
      if (term.end) {
        const e = termToSql(term.end, bindings, varTypes);
        return `SUBSTR(${obj}, 1, (${e}))`;
      }
      return obj;
    }
  }
}

/** Check whether a term has integer type. */
function isIntegerTerm(term: Term, varTypes?: Map<string, SqlType>): boolean {
  if (term.kind === "number") return Number.isInteger(term.value);
  if (term.kind === "variable") return varTypes?.get(term.name) === "integer";
  if (term.kind === "call" && term.name === "len") return true;
  if (term.kind === "binary") {
    // Arithmetic on integers stays integer (except / which may produce real)
    return isIntegerTerm(term.left, varTypes) && isIntegerTerm(term.right, varTypes);
  }
  if (term.kind === "unary") return isIntegerTerm(term.operand, varTypes);
  return false;
}

/** Check whether a term has text type (for choosing || over +). */
function isTextType(term: Term, varTypes?: Map<string, SqlType>): boolean {
  if (term.kind === "string") return true;
  if (term.kind === "call" && term.name === "len") return false;
  if (term.kind === "subscript" || term.kind === "slice") return true;
  if (term.kind === "variable" && varTypes?.get(term.name) === "text") return true;
  return false;
}

/** Translate a built-in function call to SQL. */
function translateCall(
  name: string,
  args: Term[],
  bindings: Map<string, Binding[]>,
  varTypes?: Map<string, SqlType>,
): string {
  const sqlArgs = args.map((a) => termToSql(a, bindings, varTypes));
  switch (name) {
    case "len":
      return `LENGTH(${sqlArgs[0]})`;
    default:
      return `${name.toUpperCase()}(${sqlArgs.join(", ")})`;
  }
}

function colList(arity: number): string {
  return Array.from({ length: arity }, (_, i) => `col${i + 1}`).join(", ");
}
