import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtDecl } from "datamog-core";
import type { Backend } from "datamog-engine";
import { parse } from "datamog-parser";
import { ExplicitSourceLoader, GSHEET_URL_RE, explicitSourceFormat } from "../src/main.ts";

// Unit tests for `expandGitHubShorthand` live with the function in
// `datamog-engine` (packages/engine/test/github-shorthand.test.ts); the
// CLI just re-uses it via `buildExplicitLoaders`.

describe("GSHEET_URL_RE", () => {
  test("Regression: stops the spreadsheet-ID capture at `?` / `#` so a query-string `gid` doesn't leak into the ID", () => {
    // The bare `[^/]+` form let a URL like
    // `https://docs.google.com/spreadsheets/d/ABC123?gid=1000` capture
    // `ABC123?gid=1000` as the spreadsheet ID — the loader would then
    // build `.../d/ABC123?gid=1000/export?format=csv` (a malformed
    // URL where the original query string is buried inside a path
    // segment) and either fetch the wrong sheet or 404.
    expect(
      GSHEET_URL_RE.exec("https://docs.google.com/spreadsheets/d/ABC123/edit?gid=1000")?.[1],
    ).toBe("ABC123");
    expect(GSHEET_URL_RE.exec("https://docs.google.com/spreadsheets/d/ABC123?gid=1000")?.[1]).toBe(
      "ABC123",
    );
    expect(GSHEET_URL_RE.exec("https://docs.google.com/spreadsheets/d/ABC123#gid=1000")?.[1]).toBe(
      "ABC123",
    );
    expect(GSHEET_URL_RE.exec("https://docs.google.com/spreadsheets/d/ABC123")?.[1]).toBe("ABC123");
  });
});

const CLI_ENTRY = join(import.meta.dir, "..", "src", "main.ts");

async function runCli(
  args: string[],
  stdin = "",
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  // Strip DATABASE_URL from the child env so the CLI's default-backend
  // selection is deterministic (postgres if set, else sqlite). Tests that
  // exercise the default expect sqlite; without this, runs in a dev
  // container with DATABASE_URL set would silently pick postgres.
  const { DATABASE_URL: _omit, ...env } = process.env;
  const proc = Bun.spawn(["bun", "run", CLI_ENTRY, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  if (stdin) proc.stdin.write(stdin);
  proc.stdin.end();
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { exitCode: proc.exitCode ?? 0, stdout, stderr };
}

function getExtDecl(source: string): ExtDecl {
  const program = parse(source);
  return program.statements[0] as ExtDecl;
}

function makeBackend(): {
  backend: Backend;
  inserts: { decl: ExtDecl; rows: Record<string, unknown>[] }[];
} {
  const inserts: { decl: ExtDecl; rows: Record<string, unknown>[] }[] = [];
  return {
    inserts,
    backend: {
      sqlDialect: null,
      async execute(): Promise<Record<string, unknown>[]> {
        return [];
      },
      close(): void {},
      async insertRows(decl: ExtDecl, rows: Record<string, unknown>[]): Promise<void> {
        inserts.push({ decl, rows });
      },
    },
  };
}

describe("CLI arg validation", () => {
  test("Regression: --help exits successfully", async () => {
    // `--help` went through the same usage() helper as invalid
    // invocations, but usage() always exited with status 1. That makes
    // `datamog --help` look like a command failure to shells and scripts.
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Usage: datamog");
  });

  test("starts the interactive REPL when no program file is given", async () => {
    const result = await runCli([], ":quit\n");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Datamog REPL (backend: sqlite)");
    expect(result.stdout).toContain("bye");
    expect(result.stderr).toBe("");
  });

  test("--json uses JSON REPL mode by default when no program file is given", async () => {
    const result = await runCli(["--json"], ":backend\n\n");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(
      result.stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([{ kind: "info", message: "backend: sqlite" }, { kind: "done" }]);
  });

  test("Regression: machine-readable output formats reject programs with no query", async () => {
    // The CLI error message says non-table formats require exactly one
    // query, but the validation only rejected `queryCount > 1`. A
    // program with zero queries exited successfully and printed nothing,
    // which is indistinguishable from an empty result stream for jsonl /
    // csv consumers. Reject zero queries with the same clear diagnostic
    // used for the multi-query case.
    const dl = "/tmp/datamog-cli-no-query.dl";
    await Bun.write(dl, "p(1).\n");
    try {
      const result = await runCli(["--output-format", "jsonl", dl]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("requires exactly one query clause");
      expect(result.stderr).toContain("found 0");
    } finally {
      await Promise.allSettled([Bun.file(dl).unlink?.()]);
    }
  });

  test("Regression: mermaid output prints a valid empty graph for empty results", async () => {
    // `rowsToMermaid([])` deliberately returns `graph TD\n` so Mermaid
    // renderers receive a syntactically valid empty graph. The CLI had a
    // pre-check that skipped the shared formatter for zero rows, so users
    // got no output at all.
    const dl = "/tmp/datamog-cli-empty-mermaid.dl";
    await Bun.write(dl, "p(1).\n?- p(2).\n");
    try {
      const result = await runCli(["--output-format", "mermaid", dl]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("graph TD\n\n");
    } finally {
      await Promise.allSettled([Bun.file(dl).unlink?.()]);
    }
  });

  test("Regression: duplicate --extensional for the same predicate is rejected with a clear error", async () => {
    // `--extensional p=a.csv --extensional p=b.csv` previously silently
    // used the first mapping (since `ExplicitFileLoader.canLoad` matches
    // by predicate name and the executor stops at the first hit). The
    // user's second flag had no effect — easy to mistake for "the
    // second value won" if they were trying to override. Surface as an
    // explicit error.
    const a = "/tmp/datamog-cli-args-a.csv";
    const b = "/tmp/datamog-cli-args-b.csv";
    const dl = "/tmp/datamog-cli-args.dl";
    await Bun.write(a, "x\n1\n");
    await Bun.write(b, "x\n2\n");
    await Bun.write(dl, "extensional p(x: integer).\n?- p(X).\n");
    try {
      const result = await runCli(["--extensional", `p=${a}`, "--extensional", `p=${b}`, dl]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("specified twice");
      expect(result.stderr).toContain("'p'");
    } finally {
      // Best-effort cleanup; not critical.
      await Promise.allSettled([
        Bun.file(a).unlink?.(),
        Bun.file(b).unlink?.(),
        Bun.file(dl).unlink?.(),
      ]);
    }
  });

  test("Regression: --extensional rejects unknown predicate names", async () => {
    // A misspelled mapping name used to silently no-op: no declared
    // extensional predicate matched the explicit loader, so the EDB stayed
    // empty and the command exited successfully with empty results.
    const csv = "/tmp/datamog-cli-unknown-ext.csv";
    const dl = "/tmp/datamog-cli-unknown-ext.dl";
    await Bun.write(csv, "x\n1\n");
    await Bun.write(dl, "extensional p(x: integer).\n?- p(X).\n");
    try {
      const result = await runCli(["--extensional", `typo=${csv}`, dl]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("unknown extensional predicate 'typo'");
      expect(result.stderr).toContain("Available extensional predicates: p");
    } finally {
      await Promise.allSettled([Bun.file(csv).unlink?.(), Bun.file(dl).unlink?.()]);
    }
  });

  test("Regression: --extensional supports whole-file JSON sources", async () => {
    // Directory auto-discovery supports `<predicate>.json`, but the
    // explicit file-mapping path only accepted `.csv`, `.jsonl`, and
    // `.mmd`. Users trying to override a JSON config path with
    // `--extensional cfg=/tmp/config.json` got an unsupported-format
    // error even though the same source shape was a documented format.
    const dir = await mkdtemp(join(tmpdir(), "datamog-cli-json-"));
    const dl = join(dir, "program.dl");
    const json = join(dir, "config.json");
    await Bun.write(dl, "extensional cfg(blob: value).\n?- cfg(X).\n");
    await Bun.write(json, '{"b":2,"a":1}');
    try {
      const result = await runCli(["--output-format", "jsonl", "--extensional", `cfg=${json}`, dl]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('{"X":{"a":1,"b":2}}');
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("Regression: explicit extensional loader supports HTTP URL sources", async () => {
    // Explicit sources used to be resolved as local filesystem paths, so
    // `--extensional p=https://host/data.csv` became a mangled path and
    // failed before the CSV parser saw any content. HTTP(S) sources now
    // fetch text first and then route through the same format-specific
    // parsers as local explicit files.
    const oldFetch = globalThis.fetch;
    const source = "https://example.test/parents.csv?download=1";
    const seenUrls: string[] = [];
    globalThis.fetch = async (input) => {
      seenUrls.push(String(input));
      return new Response("name,child\nalice,bob\nbob,carol\n");
    };
    try {
      const format = explicitSourceFormat(source);
      expect(format).toBe(".csv");
      const loader = new ExplicitSourceLoader("parent", source, format!, true);
      const decl = getExtDecl("extensional parent(name: string, child: string).");
      const { backend, inserts } = makeBackend();
      const result = await loader.load(decl, backend);

      expect(result.rowsLoaded).toBe(2);
      expect(seenUrls).toEqual([source]);
      expect(inserts[0]?.rows).toEqual([
        { name: "alice", child: "bob" },
        { name: "bob", child: "carol" },
      ]);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});
