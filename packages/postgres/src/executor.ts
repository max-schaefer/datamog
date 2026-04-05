import { analyze } from "datamog-core";
import { parse } from "datamog-parser";
import type { BunSQL, ExtensionalLoader } from "./loader.ts";
import { type Dialect, translate } from "./translator.ts";

export interface ExecutorOptions {
  dialect?: Dialect;
}

export interface QueryResult {
  sql: string;
  rows: Record<string, unknown>[];
}

export class DatamogExecutor {
  private loaders: ExtensionalLoader[] = [];
  private dialect: Dialect;

  constructor(
    private sql: BunSQL,
    loaders: ExtensionalLoader[] = [],
    options: ExecutorOptions = {},
  ) {
    this.loaders = [...loaders];
    this.dialect = options.dialect ?? "postgres";
  }

  addLoader(loader: ExtensionalLoader): void {
    this.loaders.push(loader);
  }

  async execute(source: string): Promise<QueryResult[]> {
    const program = parse(source);
    const analyzed = analyze(program);
    const translation = translate(analyzed, { dialect: this.dialect });

    // 1. Create tables
    for (const stmt of translation.createTables) {
      await this.sql.unsafe(stmt);
    }

    // 2. Load extensional data
    for (const decl of analyzed.extDecls.values()) {
      for (const loader of this.loaders) {
        if (await loader.canLoad(decl)) {
          await loader.load(decl, this.sql);
          break;
        }
      }
    }

    // 3. Create views
    for (const stmt of translation.createViews) {
      await this.sql.unsafe(stmt);
    }

    // 4. Execute queries
    const results: QueryResult[] = [];
    const settledResults = await Promise.allSettled(
      translation.queries.map(async (querySql) => {
        const rows = (await this.sql.unsafe(querySql)) as Record<string, unknown>[];
        return { sql: querySql, rows };
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
