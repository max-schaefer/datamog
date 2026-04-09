import type { AnalyzedProgram, Rule, Term } from "datamog-core";

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
      // Non-recursive: single predicate, plain view
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
      // Self-recursive: single predicate with WITH RECURSIVE
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
      // Mutually recursive: multiple predicates sharing a WITH RECURSIVE block
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

function translateRule(rule: Rule, analyzed: AnalyzedProgram): string {
  if (rule.body.length === 0) {
    return translateFact(rule);
  }

  // Separate positive and negated body atoms
  const positiveAtoms: { atom: (typeof rule.body)[number]; index: number }[] = [];
  const negatedAtoms: { atom: (typeof rule.body)[number]; index: number }[] = [];
  for (let i = 0; i < rule.body.length; i++) {
    const atom = rule.body[i]!;
    if (atom.negated) {
      negatedAtoms.push({ atom, index: i });
    } else {
      positiveAtoms.push({ atom, index: i });
    }
  }

  const aliases = rule.body.map((_, i) => `__b${i}`);

  // Build variable bindings from positive atoms only
  const bindings = new Map<string, { alias: string; col: string }[]>();

  for (const { atom, index } of positiveAtoms) {
    const alias = aliases[index]!;
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      if (term.kind === "variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        const list = bindings.get(term.name) ?? [];
        list.push({ alias, col });
        bindings.set(term.name, list);
      }
    }
  }

  // SELECT clause: map head args to their first binding
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
      selectParts.push(`${refs[0]!.alias}.${ident(refs[0]!.col)} AS ${targetCol}`);
    } else {
      selectParts.push(`${literalSql(term)} AS ${targetCol}`);
    }
  }

  // FROM clause: only positive atoms
  const fromParts = positiveAtoms.map(
    ({ atom, index }) => `${ident(atom.predicate)} AS ${aliases[index]}`,
  );

  // WHERE clause: join conditions (shared variables) + constant conditions
  const conditions: string[] = [];

  // Join conditions from shared variables (positive atoms only)
  for (const [, refs] of bindings) {
    for (let i = 1; i < refs.length; i++) {
      conditions.push(
        `${refs[0]!.alias}.${ident(refs[0]!.col)} = ${refs[i]!.alias}.${ident(refs[i]!.col)}`,
      );
    }
  }

  // Constant conditions (positive atoms only)
  for (const { atom, index } of positiveAtoms) {
    const alias = aliases[index]!;
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      if (term.kind !== "variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        conditions.push(`${alias}.${ident(col)} = ${literalSql(term)}`);
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
        // Bind to the outer query's variable
        const refs = bindings.get(term.name);
        if (refs && refs.length > 0) {
          subConditions.push(`${ident(col)} = ${refs[0]!.alias}.${ident(refs[0]!.col)}`);
        }
      } else {
        subConditions.push(`${ident(col)} = ${literalSql(term)}`);
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
  const selectParts = rule.head.args.map((term, i) => `${literalSql(term)} AS col${i + 1}`);
  return `SELECT ${selectParts.join(", ")}`;
}

// --- Queries ---

function translateQueries(analyzed: AnalyzedProgram): string[] {
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
        conditions.push(`${ident(col)} = ${literalSql(term)}`);
      }
    }

    // If all args are constants, select all columns
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
  // IDB predicate: use positional column names
  return `col${argIndex + 1}`;
}

function ident(name: string): string {
  return `"${name}"`;
}

function literalSql(term: Term): string {
  switch (term.kind) {
    case "string":
      return `'${term.value.replace(/'/g, "''")}'`;
    case "number":
      return String(term.value);
    default:
      throw new Error(`Cannot convert ${term.kind} to SQL literal`);
  }
}

function colList(arity: number): string {
  return Array.from({ length: arity }, (_, i) => `col${i + 1}`).join(", ");
}
