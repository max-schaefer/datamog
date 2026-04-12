import type { AnalyzedProgram, Rule } from "datamog-core";
import { type SqlDialect, colList, ident } from "datamog-engine";

export class PostgresSqlDialect implements SqlDialect {
  readonly name = "postgres";

  createView(name: string, body: string): string {
    return `CREATE OR REPLACE VIEW ${ident(name)} AS\n  ${body}\n;`;
  }

  createRecursiveView(name: string, columns: string, body: string): string {
    return `CREATE RECURSIVE VIEW ${ident(name)} (${columns}) AS (\n  ${body}\n);`;
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
    const cteParts = stratum.map((predicate) => {
      const predRules = rules.get(predicate)!;
      const arity = arities.get(predicate)!;
      const ruleQueries = predRules.map((rule) => translateRule(rule));
      const unionBody = ruleQueries.join("\n    UNION\n  ");
      const colNames = colList(arity);
      return `  ${ident(predicate)}(${colNames}) AS (\n  ${unionBody}\n  )`;
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
