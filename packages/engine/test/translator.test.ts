import { describe, expect, test } from "bun:test";
import { analyze } from "datamog-core";
import { parse } from "datamog-parser";
import { translate } from "../src/translator.ts";

import type { Dialect } from "../src/translator.ts";

function translateSource(source: string, dialect: Dialect = "postgres") {
  return translate(analyze(parse(source)), { dialect });
}

/** Normalize whitespace for comparison */
function norm(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("translator", () => {
  test("generates CREATE TABLE for ext declaration", () => {
    const result = translateSource("extensional parent(name: text, child: text).");
    expect(result.createTables).toHaveLength(1);
    expect(norm(result.createTables[0]!)).toBe(
      'CREATE TABLE IF NOT EXISTS "parent" ( "name" TEXT NOT NULL, "child" TEXT NOT NULL );',
    );
  });

  test("maps SQL types correctly", () => {
    const result = translateSource("extensional t(a: text, b: integer, c: real, d: boolean).");
    const sql = norm(result.createTables[0]!);
    expect(sql).toContain('"a" TEXT NOT NULL');
    expect(sql).toContain('"b" INTEGER NOT NULL');
    expect(sql).toContain('"c" REAL NOT NULL');
    expect(sql).toContain('"d" BOOLEAN NOT NULL');
  });

  test("generates CREATE VIEW for non-recursive rule", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      grandparent(X, Y) :- parent(X, Z), parent(Z, Y).
    `);
    expect(result.createViews).toHaveLength(1);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain('CREATE OR REPLACE VIEW "grandparent"');
    expect(sql).toContain("FROM");
    expect(sql).not.toContain("RECURSIVE");
  });

  test("generates join conditions from shared variables", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      grandparent(X, Y) :- parent(X, Z), parent(Z, Y).
    `);
    const sql = norm(result.createViews[0]!);
    // Z is shared between parent(X, Z) and parent(Z, Y)
    // Should produce a join condition on the child column of b0 and name column of b1
    expect(sql).toContain('__b0."child" = __b1."name"');
  });

  test("generates WHERE for constants in rule body", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      alice_child(X) :- parent("alice", X).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("__b0.\"name\" = 'alice'");
  });

  test("generates UNION for multiple rules with same head", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      related(X, Y) :- parent(X, Y).
      related(X, Y) :- parent(Y, X).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("UNION");
  });

  test("generates CREATE RECURSIVE VIEW for recursive rules", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `);
    expect(result.createViews).toHaveLength(1);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE RECURSIVE VIEW");
    expect(sql).toContain("UNION");
  });

  test("generates SELECT for query with constants", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ?- ancestor("alice", X).
    `);
    expect(result.queries).toHaveLength(1);
    const sql = norm(result.queries[0]!);
    expect(sql).toContain("SELECT");
    expect(sql).toContain("'alice'");
  });

  test("generates SELECT for query with all variables", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ?- ancestor(X, Y).
    `);
    const sql = norm(result.queries[0]!);
    expect(sql).toContain("SELECT");
    // Should select all columns
    expect(sql).toContain("col1");
    expect(sql).toContain("col2");
  });

  test("handles facts (rules with empty body)", () => {
    const result = translateSource('base("hello").');
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("SELECT");
    expect(sql).toContain("'hello'");
  });

  test("handles constants in rule head", () => {
    const result = translateSource(`
      extensional items(name: text).
      tagged(X, "yes") :- items(X).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("'yes' AS col2");
    expect(sql).toContain('__b0."name" AS col1');
  });

  test("don't-care variables do not create join conditions", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      has_child(X) :- parent(X, _).
    `);
    const sql = norm(result.createViews[0]!);
    // The _ should not produce a join — just select X from parent
    expect(sql).toContain('__b0."name" AS col1');
    expect(sql).not.toContain("WHERE");
  });

  test("views are ordered by dependencies", () => {
    const result = translateSource(`
      extensional edge(src: text, dst: text).
      path(X, Y) :- edge(X, Y).
      path(X, Y) :- edge(X, Z), path(Z, Y).
      reachable(X) :- path("start", X).
    `);
    expect(result.createViews).toHaveLength(2);
    const firstView = norm(result.createViews[0]!);
    const secondView = norm(result.createViews[1]!);
    expect(firstView).toContain('"path"');
    expect(secondView).toContain('"reachable"');
  });

  test("number constants in queries", () => {
    const result = translateSource(`
      extensional scores(name: text, score: integer).
      high(X) :- scores(X, 100).
      ?- high(X).
    `);
    const viewSql = norm(result.createViews[0]!);
    expect(viewSql).toContain('__b0."score" = 100');
  });

  test("generates views with shared WITH RECURSIVE for mutual recursion", () => {
    const result = translateSource(`
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
    `);
    // One view per predicate in the mutually recursive group
    expect(result.createViews).toHaveLength(2);
    const evenView = result.createViews.find((v) => norm(v).includes('VIEW "even"'));
    const oddView = result.createViews.find((v) => norm(v).includes('VIEW "odd"'));
    expect(evenView).toBeDefined();
    expect(oddView).toBeDefined();
    // Both should contain WITH RECURSIVE with both CTEs
    expect(norm(evenView!)).toContain("WITH RECURSIVE");
    expect(norm(evenView!)).toContain('"even"(col1)');
    expect(norm(evenView!)).toContain('"odd"(col1)');
    expect(norm(evenView!)).toContain('SELECT * FROM "even"');
    expect(norm(oddView!)).toContain('SELECT * FROM "odd"');
  });

  test("mutual recursion with dependent non-recursive predicate", () => {
    const result = translateSource(`
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
      all_even(X) :- even(X).
    `);
    // 2 views for even/odd (mutual recursion) + 1 for all_even
    expect(result.createViews).toHaveLength(3);
    const allEvenView = result.createViews.find((v) => norm(v).includes('VIEW "all_even"'));
    expect(allEvenView).toBeDefined();
    expect(norm(allEvenView!)).not.toContain("RECURSIVE");
  });
});

describe("translator (sqlite dialect)", () => {
  test("generates CREATE VIEW IF NOT EXISTS for non-recursive rule", () => {
    const result = translateSource(
      `
      extensional parent(name: text, child: text).
      grandparent(X, Y) :- parent(X, Z), parent(Z, Y).
    `,
      "sqlite",
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE VIEW IF NOT EXISTS");
    expect(sql).not.toContain("OR REPLACE");
    expect(sql).not.toContain("RECURSIVE");
  });

  test("generates WITH RECURSIVE inside CREATE VIEW for recursive rule", () => {
    const result = translateSource(
      `
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `,
      "sqlite",
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE VIEW IF NOT EXISTS");
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain('SELECT * FROM "ancestor"');
  });

  test("generates WITH RECURSIVE for mutual recursion", () => {
    const result = translateSource(
      `
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
    `,
      "sqlite",
    );
    expect(result.createViews).toHaveLength(2);
    const evenView = result.createViews.find((v) => norm(v).includes('SELECT * FROM "even"'));
    expect(evenView).toBeDefined();
    expect(norm(evenView!)).toContain("CREATE VIEW IF NOT EXISTS");
    expect(norm(evenView!)).toContain("WITH RECURSIVE");
  });
});
