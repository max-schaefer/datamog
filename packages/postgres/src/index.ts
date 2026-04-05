export { analyze, type AnalyzedProgram } from "datamog-core";
export { DatamogExecutor, type ExecutorOptions, type QueryResult } from "./executor.ts";
export { createInMemoryDatabase, createSqliteAdapter } from "./sqlite-adapter.ts";
export type { BunSQL, ExtensionalLoader, LoadResult } from "./loader.ts";
export {
  translate,
  type Dialect,
  type TranslateOptions,
  type TranslationResult,
} from "./translator.ts";
