// Native in-memory Datalog backend. See ./evaluator.ts for the evaluation
// algorithm and ./values.ts for term evaluation semantics.

import type { ExtDecl, Query, TypedProgram } from "datamog-core";
import {
  type Backend,
  type ExtensionalLoader,
  type QueryResult,
  loadExtensionalData,
} from "datamog-engine";
import { NaiveEvaluator } from "./evaluator.ts";
import type { TraceCallback } from "./trace.ts";

export { BaseDatalogEvaluator } from "./base-evaluator.ts";
export { NaiveEvaluator } from "./evaluator.ts";
export type { Relation } from "./planner.ts";
export {
  type DeltaOverride,
  type RulePlan,
  type Step,
  addRow,
  buildVarTypes,
  enumerate,
  evalAggregate,
  makeRelation,
  matchAtom,
  planRule,
  rowKey,
} from "./planner.ts";
export type { SourceSpan, TraceCallback, TraceEvent, TraceTuple } from "./trace.ts";
export {
  type Substitution,
  type TypeEnv,
  type Value,
  compareOp,
  evalTerm,
  logicalEq,
  valueEq,
} from "./values.ts";

export interface NativeBackendOptions {
  /**
   * If supplied, `NaiveEvaluator` will invoke this callback during
   * evaluation with stratum/iteration/rule events. See `TraceEvent` for
   * the event shape; `computeAll()` emits events in the order documented
   * there.
   */
  trace?: TraceCallback;
}

/**
 * Minimal evaluator surface needed to wire one up as a `Backend`. Both
 * `NaiveEvaluator` and `SemiNaiveEvaluator` (in `datamog-backend-seminaive`)
 * satisfy this — the factory below takes either constructor.
 */
export interface DatalogEvaluator {
  appendEdb(predicate: string, rows: Record<string, unknown>[]): void;
  computeAll(): void;
  runQuery(query: Query): QueryResult;
}

export type DatalogEvaluatorCtor<E extends DatalogEvaluator> = new (
  analyzed: TypedProgram,
  trace?: TraceCallback,
) => E;

/**
 * Build a `Backend` driven by an in-memory Datalog evaluator. Used by
 * the naive and semi-naive backends — the only thing that varies between
 * them is which evaluator constructor is passed in (and the wording of
 * the SQL-execute error). The evaluator is created lazily on first
 * `evaluateProgram` so the same backend instance can be re-used across
 * executor runs with different typed programs.
 */
export function createEvaluatorBackend<E extends DatalogEvaluator>(
  EvaluatorCtor: DatalogEvaluatorCtor<E>,
  options: NativeBackendOptions & { name: string },
): Backend {
  const trace = options.trace;
  let evaluator: E | null = null;
  let acceptingInserts = false;
  let closed = false;
  // If a caller invokes `insertRows` before `evaluateProgram` we buffer
  // here and replay once the evaluator exists.
  const bufferedInserts: { decl: ExtDecl; rows: Record<string, unknown>[] }[] = [];

  function assertOpen(): void {
    if (closed) {
      throw new Error(`${options.name} backend is closed`);
    }
  }

  // Pin the object to `Backend` so `this` inside the methods narrows to
  // the concrete backend type rather than the wrapping `Promise<Backend>`
  // — without the annotation, `loader.load(decl, this)` infers `this` as
  // `Backend | PromiseLike<Backend>` and the call fails to type-check.
  const backend: Backend = {
    sqlDialect: null,

    async execute(): Promise<Record<string, unknown>[]> {
      throw new Error(
        `${options.name} backend does not execute SQL. Use DatamogExecutor, which dispatches via Backend.evaluateProgram.`,
      );
    },

    async insertRows(decl: ExtDecl, rows: Record<string, unknown>[]): Promise<void> {
      assertOpen();
      if (evaluator && acceptingInserts) {
        evaluator.appendEdb(decl.predicate, rows);
      } else {
        bufferedInserts.push({ decl, rows });
      }
    },

    async evaluateProgram(
      analyzed: TypedProgram,
      loaders: ExtensionalLoader[],
    ): Promise<QueryResult[]> {
      assertOpen();
      const ev = new EvaluatorCtor(analyzed, trace);
      evaluator = ev;
      acceptingInserts = true;
      try {
        for (const { decl, rows } of bufferedInserts) {
          ev.appendEdb(decl.predicate, rows);
        }
        bufferedInserts.length = 0;

        // Loaders call `insertRows(backend, decl, rows)`, which uses our
        // `insertRows` (see above) to feed the evaluator.
        await loadExtensionalData(analyzed, loaders, this);
        assertOpen();
      } finally {
        acceptingInserts = false;
      }

      ev.computeAll();

      const results: QueryResult[] = [];
      for (const query of analyzed.queries) {
        const result = ev.runQuery(query);
        if (query.outputName) result.label = query.outputName;
        results.push(result);
      }
      return results;
    },

    close(): void {
      closed = true;
      evaluator = null;
      acceptingInserts = false;
      bufferedInserts.length = 0;
    },
  };
  return backend;
}

export async function create(options: NativeBackendOptions = {}): Promise<Backend> {
  return createEvaluatorBackend(NaiveEvaluator, { ...options, name: "Native" });
}
