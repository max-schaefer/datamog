import type { AnalyzedProgram, Atom, Equality, Rule, Term } from "datamog-core";

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
      const ruleQueries = rules.map((rule) => translateRule(rule, analyzed));
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
      const ruleQueries = rules.map((rule) => translateRule(rule, analyzed));
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
      const cteParts = stratum.map((predicate) => {
        const rules = analyzed.rules.get(predicate)!;
        const arity = analyzed.arities.get(predicate)!;
        const ruleQueries = rules.map((rule) => translateRule(rule, analyzed));
        const unionBody = ruleQueries.join("\n    UNION\n  ");
        const colNames = colList(arity);
        return `  ${ident(predicate)}(${colNames}) AS (\n  ${unionBody}\n  )`;
      });
      const withBlock = `WITH RECURSIVE\n${cteParts.join(",\n")}`;

      for (const predicate of stratum) {
        if (dialect === "sqlite") {
          views.push(
            `CREATE VIEW IF NOT EXISTS ${ident(predicate)} AS\n  ${withBlock}\n  SELECT * FROM ${ident(predicate)}\n;`,
          );
        } else {
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

function translateRule(rule: Rule, analyzed: AnalyzedProgram): string {
  if (rule.body.length === 0) {
    return translateFact(rule);
  }

  // Separate body elements
  const positiveAtoms: { atom: Atom; index: number }[] = [];
  const negatedAtoms: { atom: Atom }[] = [];
  const equalities: Equality[] = [];

  for (let i = 0; i < rule.body.length; i++) {
    const elem = rule.body[i]!;
    if (elem.kind === "equality") {
      equalities.push(elem);
    } else if (elem.negated) {
      negatedAtoms.push({ atom: elem });
    } else {
      positiveAtoms.push({ atom: elem, index: i });
    }
  }

  const aliases = rule.body.map((_, i) => `__b${i}`);

  // Build variable bindings from positive atoms (column refs)
  const bindings = new Map<string, Binding[]>();

  for (const { atom, index } of positiveAtoms) {
    const alias = aliases[index]!;
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      if (term.kind === "variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        const list = bindings.get(term.name) ?? [];
        list.push({ kind: "col", alias, col });
        bindings.set(term.name, list);
      }
    }
  }

  // Register equality bindings: X = expr → bind X to the SQL expression
  for (const eq of equalities) {
    const sql = termToSql(eq.expr, bindings);
    const list = bindings.get(eq.variable) ?? [];
    list.push({ kind: "expr", sql });
    bindings.set(eq.variable, list);
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
      selectParts.push(`${termToSql(term, bindings)} AS ${targetCol}`);
    }
  }

  // FROM clause: only positive atoms
  const fromParts = positiveAtoms.map(
    ({ atom, index }) => `${ident(atom.predicate)} AS ${aliases[index]}`,
  );

  // WHERE conditions
  const conditions: string[] = [];

  // Join conditions from shared variables (column bindings only)
  for (const [, refs] of bindings) {
    const colRefs = refs.filter((r) => r.kind === "col");
    for (let i = 1; i < colRefs.length; i++) {
      conditions.push(`${bindingToSql(colRefs[0]!)} = ${bindingToSql(colRefs[i]!)}`);
    }
  }

  // Non-variable argument conditions for positive atoms
  for (const { atom, index } of positiveAtoms) {
    const alias = aliases[index]!;
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      if (term.kind !== "variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        conditions.push(`${alias}.${ident(col)} = ${termToSql(term, bindings)}`);
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
        subConditions.push(`${ident(col)} = ${termToSql(term, bindings)}`);
      }
    }
    let subquery = `SELECT 1 FROM ${ident(atom.predicate)}`;
    if (subConditions.length > 0) {
      subquery += ` WHERE ${subConditions.join(" AND ")}`;
    }
    conditions.push(`NOT EXISTS (${subquery})`);
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

/** Convert a Term AST node to a SQL expression string. */
function termToSql(term: Term, bindings: Map<string, Binding[]>): string {
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
    case "binary":
      return `(${termToSql(term.left, bindings)} ${term.op} ${termToSql(term.right, bindings)})`;
    case "unary":
      return `(-${termToSql(term.operand, bindings)})`;
  }
}

function colList(arity: number): string {
  return Array.from({ length: arity }, (_, i) => `col${i + 1}`).join(", ");
}
