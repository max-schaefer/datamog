import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { create } from "datamog-backend-sqlite";
import { CsvLoader } from "datamog-csv";
import { DatamogExecutor } from "datamog-engine";
import { JsonlLoader } from "datamog-jsonl";

const EXAMPLES_DIR = join(dirname(import.meta.dir), "examples");

function getExamples(): string[] {
  return readdirSync(EXAMPLES_DIR).filter((name) => {
    const dir = join(EXAMPLES_DIR, name);
    return readdirSync(dir).some((f) => f.endsWith(".dl"));
  });
}

async function runExample(name: string): Promise<Record<string, unknown>[][]> {
  const dir = join(EXAMPLES_DIR, name);
  const dlFile = readdirSync(dir).find((f) => f.endsWith(".dl"))!;
  const source = await Bun.file(join(dir, dlFile)).text();

  const backend = create();
  const executor = new DatamogExecutor(backend, [
    new CsvLoader({ directory: dir }),
    new JsonlLoader({ directory: dir }),
  ]);

  try {
    const results = await executor.execute(source);
    return results.map((r) => r.rows);
  } finally {
    await backend.close();
  }
}

describe("examples", () => {
  for (const name of getExamples()) {
    const expectedPath = join(EXAMPLES_DIR, name, "expected.json");

    test(name, async () => {
      const actual = await runExample(name);

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
