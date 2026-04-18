import { describe, expect, test } from "bun:test";
import { DuckDbSqlDialect } from "datamog-backend-duckdb";
import { PostgresSqlDialect } from "datamog-backend-postgres";
import { SqliteSqlDialect } from "datamog-backend-sqlite";
import { analyze, inferTypes } from "datamog-core";
import { parse } from "datamog-parser";
import type { SqlDialect } from "../src/dialect.ts";
import { translate } from "../src/translator.ts";

const duckdb = new DuckDbSqlDialect();
const postgres = new PostgresSqlDialect();
const sqlite = new SqliteSqlDialect();

function translateSource(source: string, dialect: SqlDialect = postgres) {
  return translate(analyze(parse(source)), dialect);
}

function translateTyped(source: string, dialect: SqlDialect = postgres) {
  return translate(inferTypes(analyze(parse(source))), dialect);
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

  test("generates SQL for arithmetic expression in head", () => {
    const result = translateSource(`
      extensional scores(name: text, score: integer).
      doubled(X, Y) :- scores(X, S), Y = S * 2.
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("AS col2");
    expect(sql).toContain("* 2");
  });

  test("generates SQL for expression in atom argument", () => {
    const result = translateSource(`
      extensional nums(val: integer).
      extensional offsets(delta: integer).
      shifted(X) :- nums(X), offsets(X + 1).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("+ 1)");
  });

  test("generates SQL for comparison", () => {
    const result = translateSource(`
      extensional scores(name: text, score: integer).
      high(X) :- scores(X, S), S > 80.
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("> 80");
  });

  test("generates SQL for != comparison", () => {
    const result = translateSource(`
      extensional pairs(a: integer, b: integer).
      diff(X, Y) :- pairs(X, Y), X != Y.
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("<>");
  });

  test("generates SQL for equality binding used in head", () => {
    const result = translateSource(`
      extensional base(x: integer).
      computed(X, Y) :- base(X), Y = X + 10.
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("+ 10");
    expect(sql).toContain("AS col2");
  });

  test("uses || for string concatenation with type info", () => {
    const result = translateTyped(`
      extensional words(w: text).
      prefixed(R) :- words(W), R = "hello_" + W.
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("||");
    expect(sql).not.toContain("+");
  });

  test("uses + for integer arithmetic with type info", () => {
    const result = translateTyped(`
      extensional nums(x: integer).
      inc(X, Y) :- nums(X), Y = X + 1.
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("+");
    expect(sql).not.toContain("||");
  });

  test("generates LENGTH for len()", () => {
    const result = translateSource(`
      extensional words(w: text).
      lengths(W, N) :- words(W), N = len(W).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("LENGTH(");
  });

  test("generates SUBSTR for subscript", () => {
    const result = translateSource(`
      extensional words(w: text).
      first_char(W, C) :- words(W), C = W[0].
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("SUBSTR(");
    expect(sql).toContain("+ 1, 1)");
  });

  test("generates SUBSTR for slice", () => {
    const result = translateSource(`
      extensional words(w: text).
      mid(W, S) :- words(W), S = W[1:3].
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("SUBSTR(");
  });

  test("generates NOT EXISTS for negated atoms", () => {
    const result = translateSource(`
      extensional node(name: text).
      extensional edge(src: text, dst: text).
      reachable(X) :- edge("start", X).
      unreachable(X) :- node(X), not reachable(X).
    `);
    const views = result.createViews;
    const unreachableView = views.find((v) => norm(v).includes('"unreachable"'));
    expect(unreachableView).toBeDefined();
    const sql = norm(unreachableView!);
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain('SELECT 1 FROM "reachable"');
    // The subquery should bind to the outer variable
    expect(sql).toContain('"col1" = __b0."name"');
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

  test("generates generate_series for binding range (postgres)", () => {
    const result = translateTyped(`
      nums(X) :- X in [1 .. 5].
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("generate_series(1, 5)");
    expect(sql).toContain('"value"');
  });

  test("generates BETWEEN for filter range (non-variable expr)", () => {
    const result = translateTyped(`
      extensional vals(x: integer).
      filtered(X) :- vals(X), X + 1 in [1 .. 100].
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("BETWEEN 1 AND 100");
  });

  test("generates BETWEEN for variable range with non-integer bounds", () => {
    const result = translateTyped(`
      extensional base(x: real).
      filtered(X) :- base(X), X in [0.5 .. 9.5].
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("BETWEEN 0.5 AND 9.5");
    expect(sql).not.toContain("generate_series");
  });

  test("generates generate_series with expression bounds", () => {
    const result = translateTyped(`
      extensional base(x: integer, y: integer).
      inrange(X, Z) :- base(X, Y), Z in [Y .. Y + 10].
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("generate_series(");
    expect(sql).toContain("+ 10)");
  });

  test("generates GROUP BY for aggregate rule", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      num_children(P, count(C)) :- parent(P, C).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain('CREATE OR REPLACE VIEW "num_children"');
    expect(sql).toContain("COUNT(");
    expect(sql).toContain("GROUP BY");
  });

  test("generates COUNT(*) for count(_)", () => {
    const result = translateSource(`
      extensional parent(name: text, child: text).
      total(count(_)) :- parent(_, _).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("COUNT(*)");
    expect(sql).not.toContain("GROUP BY");
  });

  test("generates SUM aggregate", () => {
    const result = translateSource(`
      extensional scores(name: text, score: integer).
      totals(X, sum(S)) :- scores(X, S).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("SUM(");
    expect(sql).toContain("GROUP BY");
  });

  test("generates aggregate with expression argument", () => {
    const result = translateSource(`
      extensional items(part: text, qty: integer, cost: integer).
      total_cost(P, sum(Q * C)) :- items(P, Q, C).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("SUM(");
    expect(sql).toContain("*");
    expect(sql).toContain("GROUP BY");
  });

  test("generates all aggregate functions", () => {
    for (const [func, sqlFunc] of [
      ["count", "COUNT"],
      ["sum", "SUM"],
      ["avg", "AVG"],
      ["min", "MIN"],
      ["max", "MAX"],
    ] as const) {
      const result = translateSource(`
        extensional t(a: text, b: integer).
        r(X, ${func}(Y)) :- t(X, Y).
      `);
      const sql = norm(result.createViews[0]!);
      expect(sql).toContain(`${sqlFunc}(`);
    }
  });

  test("generates UNION of aggregate rules", () => {
    const result = translateSource(`
      extensional t1(a: text, b: integer).
      extensional t2(a: text, b: integer).
      totals(X, sum(Y)) :- t1(X, Y).
      totals(X, sum(Y)) :- t2(X, Y).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("UNION");
    expect(sql).toContain("GROUP BY");
  });

  test("generates STRING_AGG for group_concat (postgres)", () => {
    const result = translateSource(`
      extensional items(group_name: text, item: text).
      concat_items(G, group_concat(I)) :- items(G, I).
    `);
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("STRING_AGG(");
    expect(sql).toContain("::TEXT");
  });

  test("rejects non-linear recursion", () => {
    expect(() =>
      translateSource(`
      extensional edge(src: text, dst: text).
      tc(X, Y) :- edge(X, Y).
      tc(X, Z) :- tc(X, Y), tc(Y, Z).
    `),
    ).toThrow(/Non-linear recursion is not supported by postgres.*'tc'/);
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
      sqlite,
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
      sqlite,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE VIEW IF NOT EXISTS");
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain('SELECT * FROM "ancestor"');
  });

  test("generates recursive CTE for binding range (sqlite)", () => {
    const result = translateTyped(
      `
      nums(X) :- X in [1 .. 5].
    `,
      sqlite,
    );
    const sql = norm(result.createViews[0]!);
    // SQLite uses a recursive CTE subquery instead of generate_series
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain('"value"');
    expect(sql).toContain(">= 1");
    expect(sql).toContain("<= 5");
    expect(sql).not.toContain("generate_series");
  });

  test("generates GROUP_CONCAT for group_concat (sqlite)", () => {
    const result = translateSource(
      `
      extensional items(group_name: text, item: text).
      concat_items(G, group_concat(I)) :- items(G, I).
    `,
      sqlite,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("GROUP_CONCAT(");
    expect(sql).not.toContain("STRING_AGG");
  });

  test("generates CREATE VIEW IF NOT EXISTS for aggregate rule (sqlite)", () => {
    const result = translateSource(
      `
      extensional parent(name: text, child: text).
      num_children(P, count(C)) :- parent(P, C).
    `,
      sqlite,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE VIEW IF NOT EXISTS");
    expect(sql).toContain("COUNT(");
    expect(sql).toContain("GROUP BY");
  });

  test("rejects non-linear recursion", () => {
    expect(() =>
      translateSource(
        `
      extensional edge(src: text, dst: text).
      tc(X, Y) :- edge(X, Y).
      tc(X, Z) :- tc(X, Y), tc(Y, Z).
    `,
        sqlite,
      ),
    ).toThrow(/Non-linear recursion is not supported by sqlite.*'tc'/);
  });

  test("generates WITH RECURSIVE for mutual recursion", () => {
    const result = translateSource(
      `
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
    `,
      sqlite,
    );
    expect(result.createViews).toHaveLength(2);
    const evenView = result.createViews.find((v) => norm(v).includes('NOT EXISTS "even"'));
    expect(evenView).toBeDefined();
    const sql = norm(evenView!);
    expect(sql).toContain("CREATE VIEW IF NOT EXISTS");
    expect(sql).toContain("WITH RECURSIVE");
    // SQLite uses a combined CTE with tag discrimination for mutual recursion
    expect(sql).toContain("__tag");
    expect(sql).toContain("'even'");
    expect(sql).toContain("'odd'");
  });
});

describe("translator (duckdb dialect)", () => {
  test("generates CREATE OR REPLACE VIEW for non-recursive rule", () => {
    const result = translateSource(
      `
      extensional parent(name: text, child: text).
      grandparent(X, Y) :- parent(X, Z), parent(Z, Y).
    `,
      duckdb,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE OR REPLACE VIEW");
    expect(sql).not.toContain("RECURSIVE");
  });

  test("generates WITH RECURSIVE inside CREATE OR REPLACE VIEW for recursive rule", () => {
    const result = translateSource(
      `
      extensional parent(name: text, child: text).
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
    `,
      duckdb,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("CREATE OR REPLACE VIEW");
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain('SELECT * FROM "ancestor"');
  });

  test("accepts non-linear recursion", () => {
    const result = translateSource(
      `
      extensional edge(src: text, dst: text).
      tc(X, Y) :- edge(X, Y).
      tc(X, Z) :- tc(X, Y), tc(Y, Z).
    `,
      duckdb,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain('FROM "tc"');
  });

  test("generates shared WITH RECURSIVE for mutual recursion", () => {
    const result = translateSource(
      `
      extensional base(x: integer).
      even(X) :- base(X).
      even(X) :- odd(X).
      odd(X) :- even(X).
    `,
      duckdb,
    );
    expect(result.createViews).toHaveLength(2);
    const evenView = result.createViews.find((v) => norm(v).includes('VIEW "even"'));
    expect(evenView).toBeDefined();
    const sql = norm(evenView!);
    expect(sql).toContain("CREATE OR REPLACE VIEW");
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain('"even"(col1)');
    expect(sql).toContain('"odd"(col1)');
  });

  test("generates generate_series for binding range", () => {
    const result = translateTyped(
      `
      nums(X) :- X in [1 .. 5].
    `,
      duckdb,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("generate_series(1, 5)");
  });

  test("generates STRING_AGG for group_concat", () => {
    const result = translateSource(
      `
      extensional items(group_name: text, item: text).
      concat_items(G, group_concat(I)) :- items(G, I).
    `,
      duckdb,
    );
    const sql = norm(result.createViews[0]!);
    expect(sql).toContain("STRING_AGG(");
    expect(sql).toContain("::TEXT");
  });

  describe("source maps", () => {
    test("emits a span per positive body atom", () => {
      const source = `extensional edge(src: text, dst: text).
reach(X) :- edge("a", X), edge(X, "b").`;
      const result = translate(inferTypes(analyze(parse(source))), sqlite);
      const [sql] = result.createViews;
      const [spans] = result.viewSpans;
      expect(sql).toBeDefined();
      expect(spans).toBeDefined();

      // Atom spans should point at the exact `edge(...)` substrings in the source.
      const atomStart1 = source.indexOf('edge("a", X)');
      const atomEnd1 = atomStart1 + 'edge("a", X)'.length;
      const atomStart2 = source.indexOf("edge(X, ", atomEnd1);
      const atomEnd2 = atomStart2 + 'edge(X, "b")'.length;

      const atomSpans = spans!.filter(
        (s) =>
          (s.astStart === atomStart1 && s.astEnd === atomEnd1) ||
          (s.astStart === atomStart2 && s.astEnd === atomEnd2),
      );
      // Two atoms, each contributing at least the FROM alias.
      expect(atomSpans.length).toBeGreaterThanOrEqual(2);

      // Each atom span covers a real substring of the emitted SQL.
      for (const s of atomSpans) {
        expect(s.sqlStart).toBeLessThan(s.sqlEnd);
        expect(s.sqlEnd).toBeLessThanOrEqual(sql!.length);
        expect(sql!.slice(s.sqlStart, s.sqlEnd)).toContain("__b");
      }
    });

    test("emits a span for the head atom and for the whole rule", () => {
      const source = `extensional edge(src: text, dst: text).
reach(X) :- edge("a", X).`;
      const result = translate(inferTypes(analyze(parse(source))), sqlite);
      const [spans] = result.viewSpans;

      const headStart = source.indexOf("reach(X)");
      const headEnd = headStart + "reach(X)".length;
      expect(spans!.some((s) => s.astStart === headStart && s.astEnd === headEnd)).toBe(true);

      const ruleStart = headStart;
      const ruleEnd = source.indexOf(".", ruleStart) + 1;
      expect(spans!.some((s) => s.astStart === ruleStart && s.astEnd === ruleEnd)).toBe(true);
    });

    test("strips span markers from the visible SQL", () => {
      const result = translate(
        inferTypes(
          analyze(
            parse(`extensional edge(src: text, dst: text).
reach(X) :- edge("a", X).`),
          ),
        ),
        sqlite,
      );
      expect(result.createViews[0]!).not.toContain("\u0001");
      expect(result.createViews[0]!).not.toContain("\u0002");
    });

    test("marks query atoms", () => {
      const source = `extensional edge(src: text, dst: text).
reach(X) :- edge("a", X).
?- reach(X).`;
      const result = translate(inferTypes(analyze(parse(source))), sqlite);
      const [spans] = result.querySpans;
      const queryStart = source.indexOf("?- reach(X).");
      const queryEnd = queryStart + "?- reach(X).".length;
      expect(spans!.some((s) => s.astStart === queryStart && s.astEnd === queryEnd)).toBe(true);
    });
  });
});
