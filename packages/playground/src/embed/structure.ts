import { isExtDecl, isQuery, parseLenient } from "datamog-parser";

/** A `?-` query, with its source span and ordinal index among all queries. */
export interface QueryPos {
  /** 0-based position among the program's queries (matches result order). */
  index: number;
  from: number;
  to: number;
}

/** An `extensional` declaration, with its predicate name and source span. */
export interface ExtPos {
  predicate: string;
  columns: string[];
  from: number;
  to: number;
}

export interface Structure {
  queries: QueryPos[];
  extensionals: ExtPos[];
}

const EMPTY: Structure = { queries: [], extensionals: [] };

/**
 * Locate every query and `extensional` declaration in `source`, with byte
 * spans, so the editor can attach inline affordances next to them. Uses
 * `parseLenient` (the buffer is usually mid-edit) and tolerates statements
 * with no CST node by skipping them.
 */
export function parseStructure(source: string): Structure {
  let program: ReturnType<typeof parseLenient>;
  try {
    program = parseLenient(source);
  } catch {
    return EMPTY;
  }
  const queries: QueryPos[] = [];
  const extensionals: ExtPos[] = [];
  let queryIndex = 0;
  for (const stmt of program.statements) {
    const cst = stmt.$cstNode;
    if (isQuery(stmt)) {
      // Count every query for the index (so it matches the executor's result
      // order), but only attach an affordance to ones with a known span.
      if (cst) queries.push({ index: queryIndex, from: cst.offset, to: cst.end });
      queryIndex++;
    } else if (isExtDecl(stmt) && cst) {
      extensionals.push({
        predicate: stmt.predicate,
        columns: stmt.columns.map((c) => c.name),
        from: cst.offset,
        to: cst.end,
      });
    }
  }
  return { queries, extensionals };
}
