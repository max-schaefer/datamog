// Trace events emitted by `NaiveEvaluator` when a `trace` callback is
// supplied. Events carry only deltas (newly-added tuples per rule
// application) so a consumer can replay them in order to reconstruct any
// intermediate state.
//
// Event sequence emitted by `computeAll`:
//
//   edb-loaded*                       (one per EDB that was populated)
//   (for each stratum, in dep order:)
//     stratum-start
//     (repeated until a no-op iteration:)
//       iteration-start
//       rule-applied*                 (one per rule, per iteration)
//       iteration-end
//     stratum-end

import type { Value } from "./values.ts";

export interface SourceSpan {
  offset: number;
  end: number;
}

/** A concrete tuple in a trace event, rendered with its column headers. */
export interface TraceTuple {
  values: Value[];
}

export type TraceEvent =
  | {
      kind: "edb-loaded";
      predicate: string;
      tuples: TraceTuple[];
    }
  | {
      kind: "stratum-start";
      stratum: number;
      predicates: string[];
      recursive: boolean;
    }
  | {
      kind: "stratum-end";
      stratum: number;
      iterations: number;
    }
  | {
      kind: "iteration-start";
      stratum: number;
      iteration: number;
    }
  | {
      kind: "iteration-end";
      stratum: number;
      iteration: number;
      added: number;
    }
  | {
      kind: "rule-applied";
      stratum: number;
      iteration: number;
      predicate: string;
      /** Rule's position among its predicate's rules. */
      ruleIndex: number;
      /** CST span of the whole rule, for editor highlighting. */
      ruleSpan?: SourceSpan;
      /** CST span of the rule head (tighter highlight target). */
      headSpan?: SourceSpan;
      /** Total tuples produced by this rule application, pre-dedup. */
      derived: number;
      /** Tuples that survived dedup and were appended to the relation. */
      added: TraceTuple[];
    };

export type TraceCallback = (event: TraceEvent) => void;
