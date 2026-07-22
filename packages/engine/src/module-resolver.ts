import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModuleResolver } from "datamog-core";
import { parseRaw } from "datamog-parser";

/**
 * A Node/Bun `ModuleResolver` for `elaborate`: reads a `from "..."` module
 * reference relative to the importing file (or the working directory for the
 * entry) and parses it raw. Reads synchronously because `elaborate` is
 * synchronous, and returns a fresh parse each call (the elaborator mutates it).
 *
 * Filesystem-only, so it lives on the `datamog-engine/module-resolver` subpath
 * rather than the package root — the browser playground bundle never pulls it in.
 */
export function createNodeModuleResolver(): ModuleResolver {
  return (ref, importerFile) => {
    const base = importerFile ? dirname(importerFile) : process.cwd();
    const path = resolve(base, ref);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (e) {
      throw new Error(`cannot read module '${ref}': ${(e as Error).message}`);
    }
    return { program: parseRaw(text, path), file: path };
  };
}
