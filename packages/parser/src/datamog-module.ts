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
import { DatamogGeneratedModule, DatamogGeneratedSharedModule } from "./generated/module.js";

export type DatamogServices = LangiumCoreServices;

export type DatamogAddedServices = object;

export const DatamogModule: Module<
  DatamogServices,
  PartialLangiumCoreServices & DatamogAddedServices
> = {
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
