import type { AnalyzedProgram, Atom, ExtDecl, Rule, Term } from "datamog-core";

export interface TranslationResult {
  createTables: string[];
  createViews: string[];
  queries: string[];
}

export function translate(analyzed: AnalyzedProgram): TranslationResult {
  const createTables = translateTables(analyzed);
  const createViews = translateViews(analyzed);
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

function translateViews(analyzed: AnalyzedProgram): string[] {
  const views: string[] = [];
  for (const predicate of analyzed.sortedPredicates) {
    const rules = analyzed.rules.get(predicate)!;
    const arity = rules[0]?.head.args.length;
    const isRecursive = analyzed.recursivePredicates.has(predicate);

    const ruleQueries = rules.map((rule) => translateRule(rule, analyzed));
    const unionBody = ruleQueries.join("\n  UNION\n");

    if (isRecursive) {
      const colNames = colList(arity);
      views.push(
        `CREATE RECURSIVE VIEW ${ident(predicate)} (${colNames}) AS (\n  ${unionBody}\n);`,
      );
    } else {
      views.push(`CREATE OR REPLACE VIEW ${ident(predicate)} AS\n  ${unionBody}\n;`);
    }
  }
  return views;
}

function translateRule(rule: Rule, analyzed: AnalyzedProgram): string {
  if (rule.body.length === 0) {
    return translateFact(rule);
  }

  const aliases = rule.body.map((_, i) => `__b${i}`);

  // Build variable bindings: variable name -> list of (alias, column expression)
  const bindings = new Map<string, { alias: string; col: string }[]>();

  for (let i = 0; i < rule.body.length; i++) {
    const atom = rule.body[i]!;
    const alias = aliases[i]!;
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
      selectParts.push(`${refs[0]?.alias}.${ident(refs[0]?.col)} AS ${targetCol}`);
    } else {
      selectParts.push(`${literalSql(term)} AS ${targetCol}`);
    }
  }

  // FROM clause
  const fromParts = rule.body.map((atom, i) => `${ident(atom.predicate)} AS ${aliases[i]}`);

  // WHERE clause: join conditions (shared variables) + constant conditions
  const conditions: string[] = [];

  // Join conditions from shared variables
  for (const [, refs] of bindings) {
    for (let i = 1; i < refs.length; i++) {
      conditions.push(
        `${refs[0]?.alias}.${ident(refs[0]?.col)} = ${refs[i]?.alias}.${ident(refs[i]?.col)}`,
      );
    }
  }

  // Constant conditions
  for (let i = 0; i < rule.body.length; i++) {
    const atom = rule.body[i]!;
    const alias = aliases[i]!;
    for (let j = 0; j < atom.args.length; j++) {
      const term = atom.args[j]!;
      if (term.kind !== "variable") {
        const col = resolveColumnRef(atom.predicate, j, analyzed);
        conditions.push(`${alias}.${ident(col)} = ${literalSql(term)}`);
      }
    }
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
    return extDecl.columns[argIndex]?.name;
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
