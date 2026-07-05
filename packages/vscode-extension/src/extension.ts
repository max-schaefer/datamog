import * as path from "node:path";
import type * as vscode from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node.js";
import { registerRunCommand } from "./run-command.ts";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("out", "language-server.js"));

  client = new LanguageClient(
    "datamog",
    "Datamog Language Server",
    {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: { module: serverModule, transport: TransportKind.ipc },
    },
    {
      documentSelector: [{ scheme: "file", language: "datamog" }],
    },
  );

  client.start();
  context.subscriptions.push({ dispose: () => client?.stop() });

  registerRunCommand(context);
}

export function deactivate(): Promise<void> | undefined {
  return client?.stop();
}
