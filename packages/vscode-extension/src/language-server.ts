import { DatamogGeneratedModule, DatamogGeneratedSharedModule } from "datamog-parser";
import { type Module, inject } from "langium";
import type { LangiumServices, PartialLangiumServices } from "langium/lsp";
import { createDefaultModule, createDefaultSharedModule, startLanguageServer } from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import { ProposedFeatures, createConnection } from "vscode-languageserver/node.js";
import { registerValidationChecks } from "./datamog-validator.js";

const connection = createConnection(ProposedFeatures.all);

const shared = inject(
  createDefaultSharedModule({ ...NodeFileSystem, connection }),
  DatamogGeneratedSharedModule,
);

const DatamogModule: Module<LangiumServices, PartialLangiumServices> = {
  validation: {},
};

const Datamog = inject(createDefaultModule({ shared }), DatamogGeneratedModule, DatamogModule);

shared.ServiceRegistry.register(Datamog);
registerValidationChecks(Datamog.validation.ValidationRegistry);
startLanguageServer(shared);
