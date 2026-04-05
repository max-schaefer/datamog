export { analyze, type AnalyzedProgram } from "datamog-core";
export type { Backend } from "./backend.ts";
export { DatamogExecutor, type QueryResult } from "./executor.ts";
export type { ExtensionalLoader, LoadResult } from "./loader.ts";
export {
  translate,
  type Dialect,
  type TranslateOptions,
  type TranslationResult,
} from "./translator.ts";
