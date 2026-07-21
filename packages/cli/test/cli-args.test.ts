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

  test("a program with no default output and no named outputs is rejected", async () => {
    // With single-output evaluation, a program that has neither a `?-`
    // default nor any `output predicate` has nothing to evaluate, so
    // running it is an error rather than silent empty output.
    const dl = "/tmp/datamog-cli-no-query.dl";
    await Bun.write(dl, "p(1).\n");
    try {
      const result = await runCli([dl]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("no default output");
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

  test("duplicate input flag for the same predicate is rejected with a clear error", async () => {
    // `--p a.csv --p b.csv` would otherwise silently use the first mapping
    // (ExplicitSourceLoader.canLoad matches by predicate name and the
    // executor stops at the first hit), so the second flag would have no
    // effect. Surface it as an explicit error.
    const a = "/tmp/datamog-cli-args-a.csv";
    const b = "/tmp/datamog-cli-args-b.csv";
    const dl = "/tmp/datamog-cli-args.dl";
    await Bun.write(a, "x\n1\n");
    await Bun.write(b, "x\n2\n");
    await Bun.write(dl, "extensional p(x: integer).\n?- p(X).\n");
    try {
      const result = await runCli([dl, "--p", a, "--p", b]);
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

  test("an input flag naming an unknown predicate is rejected", async () => {
    // A misspelled input flag used to silently no-op: no declared input
    // predicate matched, so the EDB stayed empty and the command exited
    // successfully with empty results.
    const csv = "/tmp/datamog-cli-unknown-ext.csv";
    const dl = "/tmp/datamog-cli-unknown-ext.dl";
    await Bun.write(csv, "x\n1\n");
    await Bun.write(dl, "extensional p(x: integer).\n?- p(X).\n");
    try {
      const result = await runCli([dl, "--typo", csv]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--typo is not an input predicate");
      expect(result.stderr).toContain("Available: p");
    } finally {
      await Promise.allSettled([Bun.file(csv).unlink?.(), Bun.file(dl).unlink?.()]);
    }
  });

  test("an input flag supports whole-file JSON sources", async () => {
    // The explicit input source accepts the same `.json` whole-file shape
    // as directory auto-discovery, not just `.csv`/`.jsonl`/`.mmd`.
    const dir = await mkdtemp(join(tmpdir(), "datamog-cli-json-"));
    const dl = join(dir, "program.dl");
    const json = join(dir, "config.json");
    await Bun.write(dl, "extensional cfg(blob: value).\n?- cfg(X).\n");
    await Bun.write(json, '{"b":2,"a":1}');
    try {
      const result = await runCli(["--output-format", "jsonl", dl, "--cfg", json]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('{"X":{"a":1,"b":2}}');
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("--input before the program supplies data (it is a global flag)", async () => {
    // `--input name=source` names its own predicate, so it works before the
    // program (and, elsewhere, in --repl, which datamog-magic relies on).
    const dir = await mkdtemp(join(tmpdir(), "datamog-cli-input-"));
    const dl = join(dir, "program.dl");
    const csv = join(dir, "src.csv");
    await Bun.write(dl, "extensional p(x: integer).\n?- p(X).\n");
    await Bun.write(csv, "x\n7\n");
    try {
      const result = await runCli(["--output-format", "jsonl", "--input", `p=${csv}`, dl]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('{"X":7}');
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("the output positional selects a named output; a kebab flag aliases the exact name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "datamog-cli-out-"));
    const dl = join(dir, "program.dl");
    const csv = join(dir, "road_network.csv");
    await Bun.write(csv, "src,dst\na,b\nb,c\n");
    await Bun.write(
      dl,
      "extensional road_network(src: string, dst: string).\n" +
        "output predicate ends(D) :- road_network(_, D).\n" +
        "?- road_network(S, D).\n",
    );
    try {
      // Named output selected by the positional.
      const named = await runCli(["--output-format", "jsonl", dl, "ends"]);
      expect(named.exitCode).toBe(0);
      expect(named.stdout.trim().split("\n").sort()).toEqual(['{"D":"b"}', '{"D":"c"}']);
      // Kebab flag aliases the snake_case input `road_network`.
      const kebab = await runCli(["--output-format", "jsonl", dl, "ends", "--road-network", csv]);
      expect(kebab.exitCode).toBe(0);
      expect(kebab.stdout.trim().split("\n").sort()).toEqual(['{"D":"b"}', '{"D":"c"}']);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("an unknown output positional is rejected, listing the available outputs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "datamog-cli-badout-"));
    const dl = join(dir, "program.dl");
    await Bun.write(dl, "p(1).\noutput predicate ends(X) :- p(X).\n?- p(X).\n");
    try {
      const result = await runCli([dl, "nope"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown output 'nope'");
      expect(result.stderr).toContain("ends");
      expect(result.stderr).toContain("default");
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
