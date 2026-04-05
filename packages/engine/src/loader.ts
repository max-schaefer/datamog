import type { ExtDecl } from "datamog-core";
import type { Backend } from "./backend.ts";

export interface LoadResult {
  rowsLoaded: number;
}

export interface ExtensionalLoader {
  readonly name: string;
  canLoad(decl: ExtDecl): Promise<boolean>;
  load(decl: ExtDecl, backend: Backend): Promise<LoadResult>;
}
