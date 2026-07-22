import { isExtDecl } from "datamog-parser";
import { AnalyzerError } from "./analyzer.ts";
import type { Binding, ExtDecl, Program, Statement } from "./ast.ts";
import { expandModule } from "./expand.ts";

/** A module a `ModuleResolver` handed back: its raw (pre-post-process) AST and
 *  the file it was read from (for resolving that module's own relative paths). */
export interface ResolvedModule {
  program: Program;
  file?: string;
}

/**
 * Resolves a module reference (the string after `from`) to its parsed module,
 * relative to the importing file. It **must return a fresh parse each call**:
 * `elaborate` mutates the returned AST in place, so importing one module twice
 * needs two independent copies. The file I/O and `parseRaw` live in the caller
 * (Bun CLI / VS Code), keeping `elaborate` itself free of filesystem access.
 */
export type ModuleResolver = (ref: string, importerFile: string | undefined) => ResolvedModule;

/** A data-file input binding, flattened out for the executor's loader setup. */
export interface DataSource {
  /** The merged-program predicate this data loads into. */
  predicate: string;
  /** The source string (a path/URL; the parser already stripped the quotes). */
  source: string;
  /** A loader format forced with `as <format>`, when the extension does not say. */
  format?: string;
  /** The file the source is resolved relative to (`undefined` for stdin). */
  baseFile?: string;
}

export interface ElaborationResult {
  /** The merged program, still raw: the caller post-processes then analyzes it. */
  program: Program;
  /** Data-file bindings, for the caller to wire loaders to explicit sources. */
  dataSources: DataSource[];
}

function nodePos(node: { $cstNode?: { offset: number; end: number } }): [number, number] | [] {
  return node.$cstNode ? [node.$cstNode.offset, node.$cstNode.end] : [];
}

/**
 * Elaborate a program's `:=` source bindings into one flat program plus a list
 * of data sources, driving `expandModule` for each module instantiation.
 *
 * First cut: only the entry's own bindings, named exports only. A referenced
 * module that itself imports a module, and selecting a module's unnamed default
 * output, are rejected for now (see the errors below). Boundary type-checking,
 * the acyclicity check for nested imports, and the Bun file resolver are still
 * to come.
 */
export function elaborate(
  entry: Program,
  resolve: ModuleResolver,
  entryFile?: string,
): ElaborationResult {
  const out: Statement[] = [];
  const dataSources: DataSource[] = [];
  let counter = 0;

  for (const stmt of entry.statements) {
    if (!isExtDecl(stmt) || !stmt.binding) {
      out.push(stmt);
      continue;
    }
    const binding = stmt.binding;
    if (!binding.isModule) {
      // Data file: keep the input as a free EDB, record its explicit source.
      recordDataSource(stmt, binding, entryFile, dataSources);
      out.push(stmt);
      continue;
    }
    if (binding.export === undefined) {
      throw new AnalyzerError(
        `selecting a module's default output ('${stmt.predicate} := from "${binding.source}"') is not yet supported; name an output with 'export from'`,
        ...nodePos(stmt),
      );
    }

    const mod = resolve(binding.source, entryFile);
    for (const s of mod.program.statements) {
      if (isExtDecl(s) && s.binding?.isModule) {
        throw new AnalyzerError(
          `module '${binding.source}' itself imports a module ('${s.predicate}'); nested module imports are not yet supported`,
          ...nodePos(stmt),
        );
      }
    }

    // Instantiate the module: wire its inputs to the actuals, rename its
    // selected output to this input's name, freshen everything else.
    const inputs: Record<string, string> = {};
    for (const actual of binding.actuals) inputs[actual.param] = actual.arg;
    const expanded = expandModule(mod.program, {
      prefix: `${stmt.predicate}$${counter++}$`,
      inputs,
      exportAs: { export: binding.export, as: stmt.predicate },
    });
    // The instance may keep its own data-bound / free inputs; record and clear
    // any data binding, relative to the module's own file.
    for (const s of expanded) {
      if (isExtDecl(s) && s.binding) recordDataSource(s, s.binding, mod.file, dataSources);
    }
    out.push(...expanded);
  }

  entry.statements = out;
  return { program: entry, dataSources };
}

/** Record a data-file binding and clear it from the declaration, so the merged
 *  program has no bindings left for the analyzer to reject. */
function recordDataSource(
  decl: ExtDecl,
  binding: Binding,
  baseFile: string | undefined,
  dataSources: DataSource[],
): void {
  dataSources.push({
    predicate: decl.predicate,
    source: binding.source,
    format: binding.format,
    baseFile,
  });
  decl.binding = undefined;
}
