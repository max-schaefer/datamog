import type { AnalyzedProgram, Rule } from "datamog-core";
import { type SqlDialect, colList, ident } from "datamog-engine";

/**
 * Split a UNION body into base (non-recursive) and recursive branches.
 * A branch is recursive if it references the CTE predicate as a table alias.
 */
function splitBranches(body: string, predicate: string): { base: string[]; rec: string[] } {
  const branches = body.split(/\n\s*UNION\n/);
  const marker = `${ident(predicate)} AS `;
  const base: string[] = [];
  const rec: string[] = [];
  for (const branch of branches) {
    (branch.includes(marker) ? rec : base).push(branch);
  }
  return { base, rec };
}

/**
 * Build a DuckDB-compatible recursive CTE body.
 *
 * DuckDB requires exactly two terms: anchor UNION recursive. Multiple
 * base branches are combined with UNION; multiple recursive branches
 * are wrapped in SELECT * FROM (...) so they count as one term.
 * Uses UNION (not UNION ALL) to preserve set semantics, which is
 * required for Datalog-style recursion to converge.
 */
function buildCteBody(base: string[], rec: string[]): string {
  const basePart = base.join("\n  UNION\n  ");
  if (rec.length === 0) return basePart;
  const recPart =
    rec.length === 1
      ? rec[0]!
      : `SELECT * FROM (\n    ${rec.join("\n    UNION\n    ")}\n  )`;
  return `${basePart}\n  UNION\n  ${recPart}`;
}

export class DuckDbSqlDialect implements SqlDialect {
  readonly name = "duckdb";
  readonly supportsNonLinearRecursion = true;

  createView(name: string, body: string): string {
    return `CREATE OR REPLACE VIEW ${ident(name)} AS\n  ${body}\n;`;
  }

  createRecursiveView(name: string, columns: string, body: string): string {
    const { base, rec } = splitBranches(body, name);
    const cteBody = buildCteBody(base, rec);
    return `CREATE OR REPLACE VIEW ${ident(name)} AS\n  WITH RECURSIVE ${ident(name)}(${columns}) AS (\n  ${cteBody}\n  )\n  SELECT * FROM ${ident(name)}\n;`;
  }

  createMutuallyRecursiveViews(
    stratum: string[],
    arities: ReadonlyMap<string, number>,
    rules: ReadonlyMap<string, Rule[]>,
    _analyzed: AnalyzedProgram,
    translateRule: (
      rule: Rule,
      renameMap?: Map<string, string>,
      tagMap?: Map<string, string>,
    ) => string,
  ): string[] {
    const stratumSet = new Set(stratum);
    const cteParts = stratum.map((predicate) => {
      const predRules = rules.get(predicate)!;
      const arity = arities.get(predicate)!;
      const colNames = colList(arity);
      const base: string[] = [];
      const rec: string[] = [];
      for (const rule of predRules) {
        const sql = translateRule(rule);
        const isRecursive =
          rule.body.length > 0 &&
          rule.body.some(
            (elem) => elem.$type === "Atom" && !elem.negated && stratumSet.has(elem.predicate),
          );
        (isRecursive ? rec : base).push(sql);
      }
      const cteBody = buildCteBody(base, rec);
      return `  ${ident(predicate)}(${colNames}) AS (\n  ${cteBody}\n  )`;
    });
    const withBlock = `WITH RECURSIVE\n${cteParts.join(",\n")}`;

    return stratum.map(
      (predicate) =>
        `CREATE OR REPLACE VIEW ${ident(predicate)} AS\n  ${withBlock}\n  SELECT * FROM ${ident(predicate)}\n;`,
    );
  }

  rangeSource(alias: string, lowSql: string, highSql: string): string {
    return `generate_series(${lowSql}, ${highSql}) AS ${alias}("value")`;
  }

  rangeConditions(_alias: string, _lowSql: string, _highSql: string): string[] {
    return [];
  }

  groupConcat(argSql: string): string {
    return `STRING_AGG(${argSql}::TEXT, ',')`;
  }
}
