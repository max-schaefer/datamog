import type { QueryResult, TranslationResult } from "datamog-engine";
import type { BackendName } from "./executor.ts";

export type { BackendName };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
let initPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./executor.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const msg = e.data;

      if (msg.type === "init-done" || msg.type === "init-error") {
        // Handled by initPromise
        return;
      }

      const id = msg.id as number;
      const req = pending.get(id);
      if (!req) return;
      pending.delete(id);

      if (msg.type.endsWith("-error")) {
        req.reject(new Error(msg.error));
      } else {
        req.resolve(msg.result ?? msg.results);
      }
    };
  }
  return worker;
}

export async function init(): Promise<void> {
  if (initPromise) return initPromise;
  const w = getWorker();
  initPromise = new Promise<void>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      if (e.data.type === "init-done") {
        w.removeEventListener("message", handler);
        resolve();
      } else if (e.data.type === "init-error") {
        w.removeEventListener("message", handler);
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ type: "init" });
  });
  return initPromise;
}

export async function execute(
  source: string,
  csvData: Record<string, string>,
): Promise<QueryResult[]> {
  await init();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    getWorker().postMessage({ type: "execute", id, source, csvData });
  });
}

export async function dryRun(source: string, backend: BackendName): Promise<TranslationResult> {
  await init();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    getWorker().postMessage({ type: "dry-run", id, source, backend });
  });
}

export interface LintDiagnostic {
  message: string;
  from?: number;
  to?: number;
}

export async function lint(source: string): Promise<LintDiagnostic[]> {
  await init();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    getWorker().postMessage({ type: "lint", id, source });
  });
}
