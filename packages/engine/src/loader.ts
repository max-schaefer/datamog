import type { ExtDecl, SqlType } from "datamog-core";
import type { Backend } from "./backend.ts";

export interface LoadResult {
  rowsLoaded: number;
}

export interface ExtensionalLoader {
  readonly name: string;
  canLoad(decl: ExtDecl): Promise<boolean>;
  load(decl: ExtDecl, backend: Backend): Promise<LoadResult>;
}

/**
 * Coerce a string value to the given SQL type, throwing on invalid values.
 * Use for string-based formats like CSV and Google Sheets.
 */
export function coerceValue(value: string, type: SqlType, context?: string): unknown {
  const ctx = context ? ` (${context})` : "";
  switch (type) {
    case "text":
      return value;
    case "integer": {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n)) {
        throw new Error(`Invalid integer value '${value}'${ctx}`);
      }
      return n;
    }
    case "real": {
      const n = Number.parseFloat(value);
      if (Number.isNaN(n)) {
        throw new Error(`Invalid real value '${value}'${ctx}`);
      }
      return n;
    }
    case "boolean":
      return ["true", "1", "yes"].includes(value.toLowerCase());
  }
}

/**
 * Validate that a native JS value matches the expected SQL type.
 * Use for already-typed formats like JSONL.
 */
export function checkValue(value: unknown, type: SqlType, context?: string): unknown {
  const ctx = context ? ` (${context})` : "";
  switch (type) {
    case "text":
      if (typeof value === "string") return value;
      throw new Error(`Expected text but got ${typeof value}${ctx}`);
    case "integer":
      if (typeof value === "number" && Number.isInteger(value)) return value;
      throw new Error(`Expected integer but got ${JSON.stringify(value)}${ctx}`);
    case "real":
      if (typeof value === "number") return value;
      throw new Error(`Expected real but got ${typeof value}${ctx}`);
    case "boolean":
      if (typeof value === "boolean") return value;
      throw new Error(`Expected boolean but got ${typeof value}${ctx}`);
  }
}
