import {
  EmptyFileSystem,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type Module,
  type PartialLangiumCoreServices,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from "langium";
import {
  DatamogGeneratedModule,
  DatamogGeneratedSharedModule,
  DatamogLanguageMetaData,
} from "./generated/module.js";

export type DatamogServices = LangiumCoreServices;

export type DatamogAddedServices = object;

export const DatamogModule: Module<
  DatamogServices,
  PartialLangiumCoreServices & DatamogAddedServices
> = {
  // The generated module defaults to development mode, which asks
  // Chevrotain to validate the grammar at parser construction time.
  // Datamog intentionally relies on Langium's LL(*) lookahead for
  // expression-shaped body elements (e.g. a literal-shaped `foo(X, Y)`
  // overlaps with a Filter wrapping a FunctionCall — the BodyElement
  // alternative order resolves it by preferring Literal), so those
  // validations only emit noisy ambiguity warnings during normal test
  // and library use. Runtime parsers should use production mode and
  // skip that self-analysis logging.
  LanguageMetaData: () => ({ ...DatamogLanguageMetaData, mode: "production" }),
  parser: {},
};

export function createDatamogServices(): {
  shared: LangiumSharedCoreServices;
  Datamog: DatamogServices;
} {
  const shared = inject(
    createDefaultSharedCoreModule(EmptyFileSystem),
    DatamogGeneratedSharedModule,
  );
  const Datamog = inject(
    createDefaultCoreModule({ shared }),
    DatamogGeneratedModule,
    DatamogModule,
  );
  shared.ServiceRegistry.register(Datamog);
  return { shared, Datamog };
}
