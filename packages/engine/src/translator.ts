import type {
  AggregateCall,
  AnalyzedProgram,
  Atom,
  BodyElement,
  Comparison,
  Expression,
  Rule,
  SqlType,
} from "datamog-core";
import { AnalyzerError, isRealLiteral } from "datamog-core";
import { type SqlDialect, colList, ident } from "./dialect.ts";

export interface SqlSpan {
  /** Offset of the SQL fragment within the containing statement. */
  sqlStart: number;
  sqlEnd: number;
  /** Offset of the source AST node this fragment was generated from. */
  astStart: number;
  astEnd: number;
}

export interface TranslationResult {
  createTables: string[];
  createViews: string[];
  queries: string[];
  /** Predicate defined by each entry in `createViews` (same length / indexing). */
  viewPredicates: string[];
  /** Predicate queried by each entry in `queries` (same length / indexing). */
  queryPredicates: string[];
  /** For each `createViews[i]`, AST-to-SQL span mappings used for hover linking. */
  viewSpans: SqlSpan[][];
  /** For each `queries[i]`, AST-to-SQL span mappings used for hover linking. */
  querySpans: SqlSpan[][];
}

export function translate(analyzed: AnalyzedProgram, dialect: SqlDialect): TranslationResult {
  const createTables = translateTables(analyzed);
  const viewResult = translateViews(analyzed, dialect);
  const queryResult = translateQueries(analyzed);
  const viewStripped = viewResult.sql.map(stripSpanMarks);
  const queryStripped = queryResult.sql.map(stripSpanMarks);
  return {
    createTables,
    createViews: viewStripped.map((v) => v.sql),
    queries: queryStripped.map((q) => q.sql),
    viewPredicates: viewResult.predicates,
    queryPredicates: queryResult.predicates,
    viewSpans: viewStripped.map((v) => v.spans),
    querySpans: queryStripped.map((q) => q.spans),
  };
}

// --- Span markers ---
//
// To link a generated SQL fragment to the Datalog AST node that produced it,
// we wrap the fragment with control-character markers: `\u0001<start>,<end>\u0001`
// opens a span covering the given AST offset range, `\u0002` closes the
// innermost open span. Markers survive string concatenation unchanged, so
// dialect wrappers (createView, createRecursiveView, ...) don't need to know
// about them. After translation we strip markers from each statement and
// emit the resulting `SqlSpan[]` alongside the clean SQL.

const MARK_START = "\u0001";
const MARK_END = "\u0002";

function markSpan(
  node: { $cstNode?: { offset: number; end: number } } | undefined,
  sql: string,
): string {
  const cst = node?.$cstNode;
  if (!cst) return sql;
  return `${MARK_START}${cst.offset},${cst.end}${MARK_START}${sql}${MARK_END}`;
}

function stripSpanMarks(marked: string): { sql: string; spans: SqlSpan[] } {
  const spans: SqlSpan[] = [];
  const stack: { astStart: number; astEnd: number; sqlStart: number }[] = [];
  let out = "";
  let i = 0;
  while (i < marked.length) {
    const c = marked[i]!;
    if (c === MARK_START) {
      const close = marked.indexOf(MARK_START, i + 1);
      if (close === -1) break;
      const [aStr, bStr] = marked.slice(i + 1, close).split(",");
      const a = Number(aStr);
      const b = Number(bStr);
      stack.push({ astStart: a, astEnd: b, sqlStart: out.length });
      i = close + 1;
    } else if (c === MARK_END) {
      const frame = stack.pop();
      if (frame) {
        spans.push({
          sqlStart: frame.sqlStart,
          sqlEnd: out.length,
          astStart: frame.astStart,
          astEnd: frame.astEnd,
        });
      }
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return { sql: out, spans };
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

function translateViews(
  analyzed: AnalyzedProgram,
  dialect: SqlDialect,
): { sql: string[]; predicates: string[] } {
  const sql: string[] = [];
  const predicates: string[] = [];
  for (const stratum of analyzed.sortedStrata) {
    const isRecursive = analyzed.recursivePredicates.has(stratum[0]!);

    if (
      isRecursive &&
      !dialect.supportsNonLinearRecursion &&
      analyzed.nonLinearPredicates.has(stratum[0]!)
    ) {
      const preds = stratum.filter((p) => analyzed.nonLinearPredicates.has(p));
      const predList = preds.map((p) => `'${p}'`).join(", ");
      throw new AnalyzerError(
        `Non-linear recursion is not supported by ${dialect.name}: ${stratum.length > 1 ? "predicates" : "predicate"} ${predList} ${preds.length > 1 ? "have" : "has"} rules with multiple recursive body atoms`,
      );
    }

    if (!isRecursive) {
      const predicate = stratum[0]!;
      const rules = analyzed.rules.get(predicate)!;
      const ruleQueries = rules.map((rule) =>
        translateRule(rule, analyzed, undefined, undefined, dialect),
      );
      const unionBody = ruleQueries.join("\n  UNION\n");
      sql.push(dialect.createView(predicate, unionBody));
      predicates.push(predicate);
    } else if (stratum.length === 1) {
      const predicate = stratum[0]!;
      const rules = analyzed.rules.get(predicate)!;
      const arity = analyzed.arities.get(predicate)!;
      const ruleQueries = rules.map((rule) =>
        translateRule(rule, analyzed, undefined, undefined, dialect),
      );
      const unionBody = ruleQueries.join("\n  UNION\n");
      const colNames = colList(arity);
      sql.push(dialect.createRecursiveView(predicate, colNames, unionBody));
      predicates.push(predicate);
    } else {
      const ruleTranslator = (
        rule: Rule,
        renameMap?: Map<string, string>,
        tagMap?: Map<string, string>,
      ) => translateRule(rule, analyzed, renameMap, tagMap, dialect);

      const mutualViews = dialect.createMutuallyRecursiveViews(
        stratum,
        analyzed.arities,
        analyzed.rules,
        analyzed,
        ruleTranslator,
      );
      // createMutuallyRecursiveViews returns one view per stratum predicate,
      // in stratum order.
      sql.push(...mutualViews);
      predicates.push(...stratum);
    }
  }
  return { sql, predicates };
}

/** Variable binding: either a column reference or an SQL expression (from equality). */
type Binding = { kind: "col"; alias: string; col: string } | { kind: "expr"; sql: string };

/**
 * Translate a single rule to a SQL SELECT statement.
 * @param renameMap - Optional map from predicate name to table/CTE name (for SQLite mutual recursion)
 * @param tagMap - Optional map from predicate name to tag value (for SQLite combined CTE discrimination)
 * @param dialect - SQL dialect for dialect-specific expressions
 */
function translateRule(
  rule: Rule,
  analyzed: AnalyzedProgram,
  renameMap: Map<string, string> | undefined,
  tagMap: Map<string, string> | undefined,
  dialect: SqlDialect,
): string {
  if (rule.body.length === 0) {
    return translateFact(rule);
  }

  // Single left-to-right pass: categorize body elements and register bindings in order.
  const positiveAtoms: { atom: Atom; index: number }[] = [];
  const negatedAtoms: { atom: Atom }[] = [];
  const comparisons: Comparison[] = [];
  const bindingRanges: {
    alias: string;
    lowSql: string;
    highSql: string;
    node: BodyElement;
  }[] = [];
  const filterRanges: {
    exprSql: string;
    lowSql: string;
    highSql: string;
    node: BodyElement;
  }[] = [];

  const aliases = rule.body.map((_, i) => `__b${i}`);
  const bindings = new Map<string, Binding[]>();
  const varTypes = new Map<string, SqlType>();
  const columnTypes = (analyzed as { columnTypes?: Map<string, SqlType[]> }).columnTypes;
  let rangeCounter = 0;

  for (let i = 0; i < rule.body.length; i++) {
    const elem = rule.body[i]!;
    switch (elem.$type) {
      case "Atom": {
        if (elem.negated) {
          negatedAtoms.push({ atom: elem });
        } else {
          const alias = aliases[i]!;
          const predTypes = columnTypes?.get(elem.predicate);
          for (let j = 0; j < elem.args.length; j++) {
            const term = elem.args[j]!;
            if (term.$type === "Variable") {
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
      case "RangeAtom": {
        const lowSql = termToSql(elem.low, bindings, varTypes);
        const highSql = termToSql(elem.high, bindings, varTypes);
        if (
          elem.expr.$type === "Variable" &&
          isIntegerTerm(elem.low, varTypes) &&
          isIntegerTerm(elem.high, varTypes)
        ) {
          const rangeAlias = `__range_${rangeCounter++}`;
          const list = bindings.get(elem.expr.name) ?? [];
          list.push({ kind: "col", alias: rangeAlias, col: "value" });
          bindings.set(elem.expr.name, list);
          bindingRanges.push({ alias: rangeAlias, lowSql, highSql, node: elem });
        } else {
          filterRanges.push({
            exprSql: termToSql(elem.expr, bindings, varTypes),
            lowSql,
            highSql,
            node: elem,
          });
        }
        break;
      }
      case "Equality": {
        const sql = termToSql(elem.expr, bindings, varTypes);
        const list = bindings.get(elem.variable) ?? [];
        list.push({ kind: "expr", sql });
        bindings.set(elem.variable, list);
        break;
      }
      case "Comparison":
        comparisons.push(elem);
        break;
    }
  }

  // Helper: resolve a binding to SQL
  function bindingToSql(b: Binding): string {
    return b.kind === "col" ? `${b.alias}.${ident(b.col)}` : b.sql;
  }

  // SELECT clause (with GROUP BY support for aggregate rules)
  const isAggregateRule = rule.head.args.some((a) => a.$type === "AggregateCall");
  const selectParts: string[] = [];
  const groupByExprs: string[] = [];

  for (let i = 0; i < rule.head.args.length; i++) {
    const term = rule.head.args[i]!;
    const targetCol = `col${i + 1}`;
    if (term.$type === "AggregateCall") {
      const aggSql = translateAggregate(term, bindings, varTypes, dialect);
      selectParts.push(`${aggSql} AS ${targetCol}`);
    } else if (term.$type === "Variable") {
      const refs = bindings.get(term.name);
      if (!refs || refs.length === 0) {
        throw new Error(
          `Unbound variable '${term.name}' in head of rule for '${rule.head.predicate}'`,
        );
      }
      const expr = bindingToSql(refs[0]!);
      selectParts.push(`${expr} AS ${targetCol}`);
      if (isAggregateRule) groupByExprs.push(expr);
    } else {
      const expr = termToSql(term, bindings, varTypes);
      selectParts.push(`${expr} AS ${targetCol}`);
      if (isAggregateRule) groupByExprs.push(expr);
    }
  }

  // FROM clause: positive atoms + binding ranges
  const fromParts = positiveAtoms.map(({ atom, index }) =>
    markSpan(
      atom,
      `${ident(renameMap?.get(atom.predicate) ?? atom.predicate)} AS ${aliases[index]}`,
    ),
  );
  for (let r = 0; r < bindingRanges.length; r++) {
    const { alias, lowSql, highSql, node } = bindingRanges[r]!;
    fromParts.push(markSpan(node, dialect.rangeSource(alias, lowSql, highSql)));
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

  // Range bound conditions (dialect-specific: empty for Postgres, present for SQLite)
  for (const { alias, lowSql, highSql, node } of bindingRanges) {
    for (const cond of dialect.rangeConditions(alias, lowSql, highSql)) {
      conditions.push(markSpan(node, cond));
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
      if (term.$type !== "Variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        conditions.push(
          markSpan(atom, `${alias}.${ident(col)} = ${termToSql(term, bindings, varTypes)}`),
        );
      }
    }
  }

  // NOT EXISTS subqueries for negated atoms
  for (const { atom } of negatedAtoms) {
    const subConditions: string[] = [];
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      const col = resolveColumnRef(atom.predicate, j, analyzed);
      if (term.$type === "Variable") {
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
    conditions.push(markSpan(atom, `NOT EXISTS (${subquery})`));
  }

  // Comparison conditions
  for (const cmp of comparisons) {
    const sqlOp = cmp.op === "!=" ? "<>" : cmp.op;
    conditions.push(
      markSpan(
        cmp,
        `${termToSql(cmp.left, bindings, varTypes)} ${sqlOp} ${termToSql(cmp.right, bindings, varTypes)}`,
      ),
    );
  }

  // Filter range conditions (non-binding ranges)
  for (const { exprSql, lowSql, highSql, node } of filterRanges) {
    conditions.push(markSpan(node, `${exprSql} BETWEEN ${lowSql} AND ${highSql}`));
  }

  const selectClause = markSpan(rule.head, `SELECT ${selectParts.join(", ")}`);
  let sql = `${selectClause} FROM ${fromParts.join(", ")}`;
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }
  if (groupByExprs.length > 0) {
    sql += ` GROUP BY ${groupByExprs.join(", ")}`;
  }
  // Wrap the whole rule so hovering anywhere in the rule source still has a
  // matching SQL span at the coarsest level.
  return markSpan(rule, sql);
}

function translateFact(rule: Rule): string {
  const emptyBindings = new Map<string, Binding[]>();
  const selectParts = rule.head.args.map(
    (term, i) => `${termToSql(term as Expression, emptyBindings)} AS col${i + 1}`,
  );
  const selectClause = markSpan(rule.head, `SELECT ${selectParts.join(", ")}`);
  return markSpan(rule, selectClause);
}

// --- Queries ---

function translateQueries(analyzed: AnalyzedProgram): { sql: string[]; predicates: string[] } {
  const emptyBindings = new Map<string, Binding[]>();
  const sql: string[] = [];
  const predicates: string[] = [];
  for (const query of analyzed.queries) {
    const atom = query.atom;
    const isIDB = analyzed.rules.has(atom.predicate);

    const selectParts: string[] = [];
    const conditions: string[] = [];

    for (let i = 0; i < atom.args.length; i++) {
      const term = atom.args[i]!;
      const col = isIDB ? `col${i + 1}` : resolveColumnRef(atom.predicate, i, analyzed);

      if (term.$type === "Variable") {
        selectParts.push(`${ident(col)} AS ${ident(term.name)}`);
      } else {
        conditions.push(`${ident(col)} = ${termToSql(term, emptyBindings)}`);
      }
    }

    if (selectParts.length === 0) {
      selectParts.push("*");
    }

    const from = markSpan(atom, `FROM ${ident(atom.predicate)}`);
    let text = `SELECT ${selectParts.join(", ")} ${from}`;
    if (conditions.length > 0) {
      text += ` WHERE ${conditions.join(" AND ")}`;
    }
    text += ";";
    sql.push(markSpan(query, text));
    predicates.push(atom.predicate);
  }
  return { sql, predicates };
}

// --- Helpers ---

function resolveColumnRef(predicate: string, argIndex: number, analyzed: AnalyzedProgram): string {
  const extDecl = analyzed.extDecls.get(predicate);
  if (extDecl) {
    return extDecl.columns[argIndex]!.name;
  }
  return `col${argIndex + 1}`;
}

/**
 * Convert a Term AST node to a SQL expression string.
 * @param varTypes - Optional variable type map for type-aware operator selection (+ vs ||)
 */
function termToSql(
  term: Expression,
  bindings: Map<string, Binding[]>,
  varTypes?: Map<string, SqlType>,
): string {
  switch (term.$type) {
    case "StringLiteral":
      return `'${term.value.replace(/'/g, "''")}'`;
    case "NumberLiteral": {
      // Preserve the original text so a real literal like `1.0` stays `1.0`
      // in SQL (emitting `1` would silently turn real division into integer
      // division).
      const raw = (term as typeof term & { rawText?: string }).rawText;
      return raw ?? String(term.value);
    }
    case "Variable": {
      const refs = bindings.get(term.name);
      if (!refs || refs.length === 0) {
        throw new Error(`Unbound variable '${term.name}'`);
      }
      const b = refs[0]!;
      return b.kind === "col" ? `${b.alias}.${ident(b.col)}` : b.sql;
    }
    case "BinaryExpr": {
      const leftSql = termToSql(term.left, bindings, varTypes);
      const rightSql = termToSql(term.right, bindings, varTypes);
      let op = term.op;
      if (op === "+" && (isTextType(term.left, varTypes) || isTextType(term.right, varTypes))) {
        op = "||" as typeof op;
      }
      return `(${leftSql} ${op} ${rightSql})`;
    }
    case "UnaryExpr":
      return `(-${termToSql(term.operand, bindings, varTypes)})`;
    case "FunctionCall":
      return translateCall(term.name, term.args, bindings, varTypes);
    case "Subscript": {
      const obj = termToSql(term.object, bindings, varTypes);
      const idx = termToSql(term.index, bindings, varTypes);
      return `SUBSTR(${obj}, (${idx}) + 1, 1)`;
    }
    case "Slice": {
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
  throw new Error(`Unexpected term type: ${(term as { $type: string }).$type}`);
}

/** Check whether a term has integer type. */
function isIntegerTerm(term: Expression, varTypes?: Map<string, SqlType>): boolean {
  if (term.$type === "NumberLiteral") return !isRealLiteral(term) && Number.isInteger(term.value);
  if (term.$type === "Variable") return varTypes?.get(term.name) === "integer";
  if (term.$type === "FunctionCall" && term.name === "len") return true;
  if (term.$type === "BinaryExpr") {
    // Arithmetic on integers stays integer (except / which may produce real)
    return isIntegerTerm(term.left, varTypes) && isIntegerTerm(term.right, varTypes);
  }
  if (term.$type === "UnaryExpr") return isIntegerTerm(term.operand, varTypes);
  return false;
}

/** Check whether a term has text type (for choosing || over +). */
function isTextType(term: Expression, varTypes?: Map<string, SqlType>): boolean {
  if (term.$type === "StringLiteral") return true;
  if (term.$type === "FunctionCall" && term.name === "len") return false;
  if (term.$type === "Subscript" || term.$type === "Slice") return true;
  if (term.$type === "Variable" && varTypes?.get(term.name) === "text") return true;
  return false;
}

/** Translate an aggregate function call to SQL. */
function translateAggregate(
  agg: AggregateCall,
  bindings: Map<string, Binding[]>,
  varTypes: Map<string, SqlType> | undefined,
  dialect: SqlDialect,
): string {
  // count(_) → COUNT(*)
  if (agg.func === "count" && agg.arg.$type === "Variable" && agg.arg.name.startsWith("_")) {
    return "COUNT(*)";
  }

  const argSql = termToSql(agg.arg, bindings, varTypes);

  switch (agg.func) {
    case "count":
      return `COUNT(${argSql})`;
    case "sum":
      return `SUM(${argSql})`;
    case "avg":
      return `AVG(${argSql})`;
    case "min":
      return `MIN(${argSql})`;
    case "max":
      return `MAX(${argSql})`;
    case "group_concat":
      return dialect.groupConcat(argSql);
    default:
      return `${agg.func.toUpperCase()}(${argSql})`;
  }
}

/** Translate a built-in function call to SQL. */
function translateCall(
  name: string,
  args: Expression[],
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
