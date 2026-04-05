import type { Dialect } from "./translator.ts";

export interface Backend {
  readonly dialect: Dialect;
  execute(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  close(): Promise<void> | void;
}
