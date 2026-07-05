// Semi-naive in-memory Datalog backend. Public surface mirrors
// `datamog-backend-native`: `create()` returns a `Backend` that exposes
// `insertRows` / `evaluateProgram` and is driven by `DatamogExecutor`.

import { createEvaluatorBackend } from "datamog-backend-native";
import type { Backend } from "datamog-engine";
import { SemiNaiveEvaluator } from "./evaluator.ts";

export { SemiNaiveEvaluator } from "./evaluator.ts";
export type {
  Relation,
  SourceSpan,
  TraceCallback,
  TraceEvent,
  TraceTuple,
} from "datamog-backend-native";

export interface SemiNaiveBackendOptions {
  /**
   * Trace callback — receives the same event shape as the naive backend so
   * existing consumers (e.g. the playground step view) work unchanged.
   */
  trace?: import("datamog-backend-native").TraceCallback;
}

export async function create(options: SemiNaiveBackendOptions = {}): Promise<Backend> {
  return createEvaluatorBackend(SemiNaiveEvaluator, { ...options, name: "Seminaive" });
}
