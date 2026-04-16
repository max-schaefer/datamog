import { analyze, inferTypes } from "datamog-core";
import { parse } from "datamog-parser";
import type { Backend } from "./backend.ts";
import type { ExtensionalLoader } from "./loader.ts";
import { translate } from "./translator.ts";

export interface QueryResult {
  sql: string;
  /** The original Datalog query source text, if available. */
  source?: string;
  rows: Record<string, unknown>[];
}

export class DatamogExecutor {
  private loaders: ExtensionalLoader[] = [];

  constructor(
    private backend: Backend,
    loaders: ExtensionalLoader[] = [],
  ) {
    this.loaders = [...loaders];
  }

  addLoader(loader: ExtensionalLoader): void {
    this.loaders.push(loader);
  }

  async execute(source: string): Promise<QueryResult[]> {
    const program = parse(source);
    const analyzed = inferTypes(analyze(program));
    const translation = translate(analyzed, this.backend.sqlDialect);

    // 1. Create tables
    for (const stmt of translation.createTables) {
      await this.backend.execute(stmt);
    }

    // 2. Load extensional data
    for (const decl of analyzed.extDecls.values()) {
      for (const loader of this.loaders) {
        if (await loader.canLoad(decl)) {
          await loader.load(decl, this.backend);
          break;
        }
      }
    }

    // 3. Create views
    for (const stmt of translation.createViews) {
      await this.backend.execute(stmt);
    }

    // 4. Execute queries
    const results: QueryResult[] = [];
    const queries = analyzed.queries;
    const settledResults = await Promise.allSettled(
      translation.queries.map(async (querySql, i) => {
        const rows = await this.backend.execute(querySql);
        const source = queries[i]?.$cstNode?.text;
        return { sql: querySql, source, rows };
      }),
    );

    for (const result of settledResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        throw result.reason;
      }
    }

    return results;
  }
}
