import { describe, expect, test } from "bun:test";
import { SqliteSqlDialect } from "datamog-backend-sqlite";
import { analyze, inferTypes } from "datamog-core";
import { parse } from "datamog-parser";
import { translate } from "../src/translator.ts";

const sqlite = new SqliteSqlDialect();
const tr = (source: string) => translate(inferTypes(analyze(parse(source))), sqlite);
const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

// A nullary predicate has no columns, but SQL has no zero-column relation, so
// the translator represents it as a single constant marker column (`col1`):
// a row present means the proposition holds.
describe("nullary predicates", () => {
  test("non-recursive nullary view uses a single marker column", () => {
    const r = tr("input predicate q(x: integer).\np() :- q(1).\n?- p().");
    const view = r.createViews.find((v) => v.includes('"p"'))!;
    // Single-rule non-recursive views emit `SELECT DISTINCT` so the view is a set.
    expect(norm(view)).toContain("SELECT DISTINCT 1 AS col1 FROM");
  });

  test("negated nullary atom compiles to NOT EXISTS", () => {
    const r = tr("input predicate q(x: integer).\np() :- q(1).\nr() :- not p().\n?- r().");
    const view = r.createViews.find((v) => v.includes('"r"'))!;
    expect(norm(view)).toContain('NOT EXISTS (SELECT 1 FROM "p")');
  });

  test("recursive-only nullary view gets a marker empty-anchor", () => {
    const r = tr("loop() :- loop().\n?- loop().");
    const view = r.createViews.find((v) => v.includes('"loop"'))!;
    expect(norm(view)).toContain("SELECT 1 AS col1 WHERE 1 = 0");
  });

  test("nullary ground query compiles to a probe", () => {
    const r = tr("input predicate q(x: integer).\np() :- q(1).\n?- p().");
    expect(norm(r.queries[0]!)).toContain("__probe");
  });

  test("nullary fact compiles to the marker column", () => {
    const r = tr("p().\n?- p().");
    const view = r.createViews.find((v) => v.includes('"p"'))!;
    expect(norm(view)).toContain("SELECT 1 AS col1");
  });
});
