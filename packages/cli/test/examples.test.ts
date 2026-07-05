import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { create as createNative } from "datamog-backend-native";
import { create as createSeminaive } from "datamog-backend-seminaive";
import { create as createSqlite } from "datamog-backend-sqlite";
import { CsvLoader } from "datamog-csv";
import { type Backend, DatamogExecutor } from "datamog-engine";
import { JsonLoader } from "datamog-json";
import { JsonlLoader } from "datamog-jsonl";
import { MermaidLoader } from "datamog-mermaid";

const EXAMPLES_DIR = join(dirname(import.meta.dir), "examples");

function getExamples(): string[] {
  return readdirSync(EXAMPLES_DIR).filter((name) => {
    const dir = join(EXAMPLES_DIR, name);
    return readdirSync(dir).some((f) => f.endsWith(".dl"));
  });
}

// Examples that use non-linear recursion can't run on the SQL backends.
// They carry a `native-only` marker file; the sqlite backend is skipped for
// them and the seminaive backend is the canonical source for expected.json.
function isNativeOnly(name: string): boolean {
  return existsSync(join(EXAMPLES_DIR, name, "native-only"));
}

async function runExample(
  name: string,
  createBackend: () => Promise<Backend>,
): Promise<Record<string, unknown>[][]> {
  const dir = join(EXAMPLES_DIR, name);
  const dlFile = readdirSync(dir).find((f) => f.endsWith(".dl"))!;
  const source = await Bun.file(join(dir, dlFile)).text();

  const backend = await createBackend();
  const executor = new DatamogExecutor(backend, [
    new CsvLoader({ directory: dir }),
    new JsonLoader({ directory: dir }),
    new JsonlLoader({ directory: dir }),
    new MermaidLoader({ directory: dir }),
  ]);

  try {
    const results = await executor.execute(source);
    return results.map((r) => r.rows);
  } finally {
    await backend.close();
  }
}

/** Datalog is set-valued, so tuple ordering inside a result set isn't stable. */
function sortResults(results: Record<string, unknown>[][]): Record<string, unknown>[][] {
  return results.map((rows) =>
    [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

describe("examples (sqlite backend)", () => {
  for (const name of getExamples()) {
    const expectedPath = join(EXAMPLES_DIR, name, "expected.json");

    // Non-linear-recursion examples are rejected by sqlite; seminaive seeds
    // their expected.json instead (see the seminaive block below).
    const sqliteTest = isNativeOnly(name) ? test.skip : test;
    sqliteTest(name, async () => {
      const actual = await runExample(name, createSqlite);

      const expectedFile = Bun.file(expectedPath);
      if (!(await expectedFile.exists())) {
        await Bun.write(expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
        console.log(`Generated ${expectedPath}`);
        return;
      }

      const expected = (await expectedFile.json()) as Record<string, unknown>[][];
      expect(actual).toEqual(expected);
    });
  }
});

describe("examples (native backend)", () => {
  for (const name of getExamples()) {
    const expectedPath = join(EXAMPLES_DIR, name, "expected.json");

    test(name, async () => {
      const expectedFile = Bun.file(expectedPath);
      if (!(await expectedFile.exists())) {
        // sqlite is the canonical source for expected.json; if it wasn't
        // generated yet, the sqlite-backend test above will create it and
        // the native test just skips on this run.
        return;
      }

      const actual = await runExample(name, createNative);
      const expected = (await expectedFile.json()) as Record<string, unknown>[][];
      // Compare set-wise: each backend is free to enumerate tuples in any
      // order. Only the SQL backends happen to match expected.json row
      // order because that's how they were generated.
      expect(sortResults(actual)).toEqual(sortResults(expected));
    });
  }
});

describe("examples (seminaive backend)", () => {
  for (const name of getExamples()) {
    const expectedPath = join(EXAMPLES_DIR, name, "expected.json");

    test(name, async () => {
      const expectedFile = Bun.file(expectedPath);
      if (!(await expectedFile.exists())) {
        // For native-only examples (non-linear recursion, no SQL backend),
        // seminaive is the canonical source for expected.json. For every
        // other example the sqlite block above seeds it; skip here.
        if (isNativeOnly(name)) {
          const actual = await runExample(name, createSeminaive);
          await Bun.write(expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
          console.log(`Generated ${expectedPath}`);
        }
        return;
      }

      const actual = await runExample(name, createSeminaive);
      const expected = (await expectedFile.json()) as Record<string, unknown>[][];
      expect(sortResults(actual)).toEqual(sortResults(expected));
    });
  }
});
