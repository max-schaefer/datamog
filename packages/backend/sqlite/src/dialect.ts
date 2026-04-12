import type { AnalyzedProgram, Rule } from "datamog-core";
import { type SqlDialect, colList, ident } from "datamog-engine";

export class SqliteSqlDialect implements SqlDialect {
  readonly name = "sqlite";

  createView(name: string, body: string): string {
    return `CREATE VIEW IF NOT EXISTS ${ident(name)} AS\n  ${body}\n;`;
  }

  createRecursiveView(name: string, columns: string, body: string): string {
    return `CREATE VIEW IF NOT EXISTS ${ident(name)} AS\n  WITH RECURSIVE ${ident(name)}(${columns}) AS (\n  ${body}\n  )\n  SELECT * FROM ${ident(name)}\n;`;
  }

  createMutuallyRecursiveViews(
    stratum: string[],
    arities: ReadonlyMap<string, number>,
    rules: ReadonlyMap<string, Rule[]>,
    analyzed: AnalyzedProgram,
    translateRule: (
      rule: Rule,
      renameMap?: Map<string, string>,
      tagMap?: Map<string, string>,
    ) => string,
  ): string[] {
    // SQLite does not support mutually recursive CTEs. We merge all
    // predicates in the SCC into a single self-recursive CTE with a
    // discriminator tag column, then create views that filter by tag.
    const maxArity = Math.max(...stratum.map((p) => arities.get(p)!));
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
      const predRules = rules.get(predicate)!;
      const arity = arities.get(predicate)!;
      const padding = maxArity - arity;
      const nullPad = padding > 0 ? `, ${Array(padding).fill("NULL").join(", ")}` : "";

      for (const rule of predRules) {
        const isRecursive =
          rule.body.length > 0 &&
          rule.body.some(
            (elem) => elem.$type === "Atom" && !elem.negated && stratumSet.has(elem.predicate),
          );
        const ruleSql = translateRule(rule, renameMap, tagMap);
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

    const views: string[] = [];
    for (const predicate of stratum) {
      const arity = arities.get(predicate)!;
      const selectCols = colList(arity);
      views.push(
        `CREATE VIEW IF NOT EXISTS ${ident(predicate)} AS\n  ${withBlock}\n  SELECT ${selectCols} FROM ${ident(combinedName)} WHERE __tag = '${predicate}'\n;`,
      );
    }
    return views;
  }

  rangeSource(alias: string, lowSql: string, highSql: string): string {
    const gen = `__gen_${alias}`;
    return `(WITH RECURSIVE ${gen}("value") AS (SELECT 0 AS "value" UNION ALL SELECT "value" + 1 FROM ${gen} WHERE "value" < 10000) SELECT "value" FROM ${gen}) AS ${alias}`;
  }

  rangeConditions(alias: string, lowSql: string, highSql: string): string[] {
    return [`${alias}."value" >= ${lowSql}`, `${alias}."value" <= ${highSql}`];
  }

  groupConcat(argSql: string): string {
    return `GROUP_CONCAT(${argSql}, ',')`;
  }
}
