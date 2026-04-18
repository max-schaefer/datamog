import { DuckDbSqlDialect } from "datamog-backend-duckdb/dialect";
import { PostgresSqlDialect } from "datamog-backend-postgres/dialect";
import { SqliteSqlDialect } from "datamog-backend-sqlite/dialect";
import { analyze, inferTypes } from "datamog-core";
import type { AnalyzedProgram } from "datamog-core";
import {
  type Backend,
  DatamogExecutor,
  type SqlDialect,
  type TranslationResult,
  translate,
} from "datamog-engine";
import { parse } from "datamog-parser";
import { InMemoryCsvLoader } from "../lib/csv-loader.ts";

export type BackendName = "sqlite" | "postgres" | "duckdb";

function dialectFor(name: BackendName): SqlDialect {
  switch (name) {
    case "sqlite":
      return new SqliteSqlDialect();
    case "postgres":
      return new PostgresSqlDialect();
    case "duckdb":
      return new DuckDbSqlDialect();
  }
}

export interface SourceSpan {
  start: number;
  end: number;
}

/**
 * Element of the Datalog source that the hover UI should treat as a unit:
 * a whole rule, its head, a body atom/equality/comparison/range, or a query.
 * The editor looks up the *innermost* element at the cursor position when
 * emitting a hover range.
 */
export interface AstElement extends SourceSpan {
  kind: "rule" | "head" | "atom" | "equality" | "comparison" | "range" | "query";
}

export interface DryRunResult {
  result: TranslationResult;
  /** Hoverable source elements, sorted ascending by (size, start). */
  elements: AstElement[];
}

function cst(node: unknown): { offset: number; end: number } | undefined {
  return (node as { $cstNode?: { offset: number; end: number } }).$cstNode;
}

function extractAstElements(analyzed: AnalyzedProgram): AstElement[] {
  const elements: AstElement[] = [];
  const push = (kind: AstElement["kind"], node: unknown) => {
    const c = cst(node);
    if (c) elements.push({ kind, start: c.offset, end: c.end });
  };
  for (const rules of analyzed.rules.values()) {
    for (const rule of rules) {
      push("rule", rule);
      push("head", rule.head);
      for (const elem of rule.body) {
        switch (elem.$type) {
          case "Atom":
            push("atom", elem);
            break;
          case "Equality":
            push("equality", elem);
            break;
          case "Comparison":
            push("comparison", elem);
            break;
          case "RangeAtom":
            push("range", elem);
            break;
        }
      }
    }
  }
  for (const query of analyzed.queries) {
    push("query", query);
    push("atom", query.atom);
  }
  // Sort by size ascending (smallest first), so "innermost element" lookup
  // can short-circuit on the first match.
  elements.sort((a, b) => a.end - a.start - (b.end - b.start));
  return elements;
}

interface InitMessage {
  type: "init";
}

interface ExecuteMessage {
  type: "execute";
  id: number;
  source: string;
  csvData: Record<string, string>;
}

interface DryRunMessage {
  type: "dry-run";
  id: number;
  source: string;
  backend: BackendName;
}

interface LintMessage {
  type: "lint";
  id: number;
  source: string;
}

type WorkerMessage = InitMessage | ExecuteMessage | DryRunMessage | LintMessage;

const SQL_JS_CDN = "https://sql.js.org/dist";

// biome-ignore lint/suspicious/noExplicitAny: sql.js types vary by bundler
let sqlModule: any = null;

async function ensureSqlJs() {
  if (!sqlModule) {
    // sql.js is a UMD bundle that Vite can't import as ESM in a module worker.
    // Load it via fetch + globalThis eval, which is how it's designed to work in browsers.
    const response = await fetch(`${SQL_JS_CDN}/sql-wasm.js`);
    const scriptText = await response.text();
    // biome-ignore lint/security/noGlobalEval: sql.js UMD needs global eval to register initSqlJs
    (0, eval)(scriptText);
    // biome-ignore lint/suspicious/noExplicitAny: set by sql.js UMD script
    const initSqlJs = (globalThis as any).initSqlJs;
    sqlModule = await initSqlJs({
      locateFile: (file: string) => `${SQL_JS_CDN}/${file}`,
    });
  }
  return sqlModule;
}

// biome-ignore lint/suspicious/noExplicitAny: sql.js module shape
function createBackend(SQL: any): Backend {
  const db = new SQL.Database();
  return {
    sqlDialect: new SqliteSqlDialect(),
    async execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      if (params && params.length > 0) {
        const bindObj: Record<string, unknown> = {};
        for (let i = 0; i < params.length; i++) {
          bindObj[`$${i + 1}`] = params[i];
        }
        if (query.trimStart().toUpperCase().startsWith("SELECT")) {
          const stmt = db.prepare(query);
          stmt.bind(bindObj);
          const rows: Record<string, unknown>[] = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject() as Record<string, unknown>);
          }
          stmt.free();
          return rows;
        }
        db.run(query, bindObj);
        return [];
      }
      if (query.trimStart().toUpperCase().startsWith("SELECT")) {
        const results = db.exec(query);
        if (results.length === 0) return [];
        const { columns, values } = results[0]!;
        return values.map((row) => {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i]!] = row[i];
          }
          return obj;
        });
      }
      db.run(query);
      return [];
    },
    close() {
      db.close();
    },
  };
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      await ensureSqlJs();
      self.postMessage({ type: "init-done" });
    } catch (err) {
      self.postMessage({ type: "init-error", error: String(err) });
    }
    return;
  }

  if (msg.type === "execute") {
    try {
      const SQL = await ensureSqlJs();
      const backend = createBackend(SQL);
      const csvMap = new Map(Object.entries(msg.csvData));
      const loaders = csvMap.size > 0 ? [new InMemoryCsvLoader(csvMap)] : [];
      const executor = new DatamogExecutor(backend, loaders);
      const results = await executor.execute(msg.source);
      backend.close();
      self.postMessage({ type: "execute-result", id: msg.id, results });
    } catch (err) {
      self.postMessage({
        type: "execute-error",
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "dry-run") {
    try {
      const program = parse(msg.source);
      const analyzed = inferTypes(analyze(program));
      const result = translate(analyzed, dialectFor(msg.backend));
      const elements = extractAstElements(analyzed);
      const payload: DryRunResult = { result, elements };
      self.postMessage({ type: "dry-run-result", id: msg.id, result: payload });
    } catch (err) {
      self.postMessage({
        type: "dry-run-error",
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "lint") {
    try {
      const program = parse(msg.source);
      const analyzed = analyze(program);
      inferTypes(analyzed);
      self.postMessage({ type: "lint-result", id: msg.id, result: [] });
    } catch (err: unknown) {
      const diag: { message: string; from?: number; to?: number } = {
        message: err instanceof Error ? err.message : String(err),
      };
      if (err instanceof Error && err.name === "ParseError") {
        const { line, column } = err as Error & { line: number; column: number };
        diag.from = lineColumnToOffset(msg.source, line, column);
        diag.to = diag.from + 1;
      } else if (err instanceof Error && err.name === "AnalyzerError") {
        const { offset, end } = err as Error & { offset?: number; end?: number };
        diag.from = offset;
        diag.to = end;
      }
      self.postMessage({ type: "lint-result", id: msg.id, result: [diag] });
    }
  }
};

function lineColumnToOffset(source: string, line: number, column: number): number {
  let offset = 0;
  for (let i = 1; i < line; i++) {
    const nl = source.indexOf("\n", offset);
    if (nl === -1) break;
    offset = nl + 1;
  }
  return offset + column - 1;
}
