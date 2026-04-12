import { describe, expect, test } from "bun:test";
import type { AggregateCall, AggregateFunction, ExtDecl, Query, Rule } from "../src/index.ts";
import { parse } from "../src/index.ts";

describe("parser", () => {
  test("ext declaration", () => {
    const program = parse("extensional parent(name: text, child: text).");
    expect(program.statements).toHaveLength(1);
    const decl = program.statements[0] as ExtDecl;
    expect(decl.$type).toBe("ExtDecl");
    expect(decl.predicate).toBe("parent");
    expect(decl.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "name", type: "text" }),
        expect.objectContaining({ name: "child", type: "text" }),
      ]),
    );
  });

  test("ext declaration with all types", () => {
    const program = parse("extensional t(a: text, b: integer, c: real, d: boolean).");
    const decl = program.statements[0] as ExtDecl;
    expect(decl.columns[0]).toMatchObject({ name: "a", type: "text" });
    expect(decl.columns[1]).toMatchObject({ name: "b", type: "integer" });
    expect(decl.columns[2]).toMatchObject({ name: "c", type: "real" });
    expect(decl.columns[3]).toMatchObject({ name: "d", type: "boolean" });
  });

  test("simple rule", () => {
    const program = parse("ancestor(X, Y) :- parent(X, Y).");
    expect(program.statements).toHaveLength(1);
    const rule = program.statements[0] as Rule;
    expect(rule.$type).toBe("Rule");
    expect(rule.head.predicate).toBe("ancestor");
    expect(rule.head.args).toHaveLength(2);
    expect(rule.head.args[0]).toMatchObject({ $type: "Variable", name: "X" });
    expect(rule.head.args[1]).toMatchObject({ $type: "Variable", name: "Y" });
    expect(rule.body).toHaveLength(1);
    expect(rule.body[0]).toMatchObject({ $type: "Atom", predicate: "parent" });
  });

  test("rule with multiple body atoms", () => {
    const program = parse("ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    expect(rule.body[0]).toMatchObject({ predicate: "parent" });
    expect(rule.body[1]).toMatchObject({ predicate: "ancestor" });
  });

  test("fact (rule with no body)", () => {
    const program = parse('base("x").');
    const rule = program.statements[0] as Rule;
    expect(rule.$type).toBe("Rule");
    expect(rule.head.predicate).toBe("base");
    expect(rule.body).toHaveLength(0);
  });

  test("query", () => {
    const program = parse('?- ancestor("alice", X).');
    expect(program.statements).toHaveLength(1);
    const query = program.statements[0] as Query;
    expect(query.$type).toBe("Query");
    expect(query.atom.predicate).toBe("ancestor");
    expect(query.atom.args[0]).toMatchObject({ $type: "StringLiteral", value: "alice" });
    expect(query.atom.args[1]).toMatchObject({ $type: "Variable", name: "X" });
  });

  test("number literal in term", () => {
    const program = parse("foo(42, 3.14).");
    const rule = program.statements[0] as Rule;
    expect(rule.head.args[0]).toMatchObject({ $type: "NumberLiteral", value: 42 });
    expect(rule.head.args[1]).toMatchObject({ $type: "NumberLiteral", value: 3.14 });
  });

  test("complete program", () => {
    const source = `
      % Extensional
      extensional parent(name: text, child: text).

      % Rules
      ancestor(X, Y) :- parent(X, Y).
      ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

      % Query
      ?- ancestor("alice", X).
    `;
    const program = parse(source);
    expect(program.statements).toHaveLength(4);
    expect(program.statements[0]?.$type).toBe("ExtDecl");
    expect(program.statements[1]?.$type).toBe("Rule");
    expect(program.statements[2]?.$type).toBe("Rule");
    expect(program.statements[3]?.$type).toBe("Query");
  });

  test("rejects unexpected token", () => {
    expect(() => parse(":-")).toThrow();
  });

  test("rejects missing dot", () => {
    expect(() => parse("foo(X)")).toThrow();
  });

  test("rejects missing closing paren", () => {
    expect(() => parse("foo(X.")).toThrow();
  });

  test("don't-care variables get unique names", () => {
    const program = parse("foo(_, _) :- bar(_, X).");
    const rule = program.statements[0] as Rule;
    const headArgs = rule.head.args;
    expect(headArgs[0]).toMatchObject({ $type: "Variable" });
    expect(headArgs[1]).toMatchObject({ $type: "Variable" });
    // Each _ should have a distinct generated name
    expect((headArgs[0] as { name: string }).name).not.toBe((headArgs[1] as { name: string }).name);
    // Body _ should also be distinct from head _s
    const bodyAtom = rule.body[0]!;
    if (bodyAtom.$type === "Atom") {
      const bodyArg = bodyAtom.args[0]!;
      expect(bodyArg).toMatchObject({ $type: "Variable" });
      expect((bodyArg as { name: string }).name).not.toBe((headArgs[0] as { name: string }).name);
      // Named variable X should be preserved
      expect(bodyAtom.args[1]).toMatchObject({ $type: "Variable", name: "X" });
    }
  });

  test("negated atom in rule body", () => {
    const program = parse("foo(X) :- bar(X), not baz(X).");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    expect(rule.body[0]?.negated).toBeFalsy();
    expect(rule.body[1]?.negated).toBe(true);
    if (rule.body[1]?.$type === "Atom") {
      expect(rule.body[1].predicate).toBe("baz");
    }
  });

  test("arithmetic expression in atom argument", () => {
    const program = parse("foo(X + 1) :- bar(X).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.$type).toBe("BinaryExpr");
    if (arg.$type === "BinaryExpr") {
      expect(arg.op).toBe("+");
      expect(arg.left).toMatchObject({ $type: "Variable", name: "X" });
      expect(arg.right).toMatchObject({ $type: "NumberLiteral", value: 1 });
    }
  });

  test("operator precedence: * before +", () => {
    const program = parse("foo(X + Y * 2) :- bar(X, Y).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.$type).toBe("BinaryExpr");
    if (arg.$type === "BinaryExpr") {
      expect(arg.op).toBe("+");
      expect(arg.left).toMatchObject({ $type: "Variable", name: "X" });
      expect(arg.right.$type).toBe("BinaryExpr");
    }
  });

  test("unary minus", () => {
    const program = parse("foo(-X) :- bar(X).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.$type).toBe("UnaryExpr");
    if (arg.$type === "UnaryExpr") {
      expect(arg.op).toBe("-");
      expect(arg.operand).toMatchObject({ $type: "Variable", name: "X" });
    }
  });

  test("parenthesized expression", () => {
    const program = parse("foo((X + 1) * 2) :- bar(X).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.$type).toBe("BinaryExpr");
    if (arg.$type === "BinaryExpr") {
      expect(arg.op).toBe("*");
      expect(arg.left.$type).toBe("BinaryExpr");
      expect(arg.right).toMatchObject({ $type: "NumberLiteral", value: 2 });
    }
  });

  test("equality in rule body", () => {
    const program = parse("foo(X, Z) :- bar(X, Y), Z = Y + 1.");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    const eq = rule.body[1]!;
    expect(eq.$type).toBe("Equality");
    if (eq.$type === "Equality") {
      expect(eq.variable).toBe("Z");
      expect(eq.expr.$type).toBe("BinaryExpr");
    }
  });

  test("mod keyword for modulo", () => {
    const program = parse("foo(R) :- bar(X), R = X mod 2.");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    const eq = rule.body[1]!;
    expect(eq.$type).toBe("Equality");
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("BinaryExpr");
      if (eq.expr.$type === "BinaryExpr") {
        expect(eq.expr.op).toBe("%");
      }
    }
  });

  test("comparison in rule body", () => {
    const program = parse("foo(X) :- bar(X, Y), Y > 10.");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    const cmp = rule.body[1]!;
    expect(cmp.$type).toBe("Comparison");
    if (cmp.$type === "Comparison") {
      expect(cmp.op).toBe(">");
      expect(cmp.left).toMatchObject({ $type: "Variable", name: "Y" });
      expect(cmp.right).toMatchObject({ $type: "NumberLiteral", value: 10 });
    }
  });

  test("comparison with expressions on both sides", () => {
    const program = parse("foo(X) :- bar(X, Y), X + 1 <= Y * 2.");
    const rule = program.statements[0] as Rule;
    const cmp = rule.body[1]!;
    expect(cmp.$type).toBe("Comparison");
    if (cmp.$type === "Comparison") {
      expect(cmp.op).toBe("<=");
      expect(cmp.left.$type).toBe("BinaryExpr");
      expect(cmp.right.$type).toBe("BinaryExpr");
    }
  });

  test("all comparison operators", () => {
    for (const [src, op] of [
      ["X < 1", "<"],
      ["X > 1", ">"],
      ["X <= 1", "<="],
      ["X >= 1", ">="],
      ["X != 1", "!="],
    ] as const) {
      const program = parse(`foo(X) :- bar(X), ${src}.`);
      const rule = program.statements[0] as Rule;
      const cmp = rule.body[1]!;
      expect(cmp.$type).toBe("Comparison");
      if (cmp.$type === "Comparison") {
        expect(cmp.op).toBe(op);
      }
    }
  });

  test("function call in expression", () => {
    const program = parse("foo(N) :- bar(X), N = len(X).");
    const rule = program.statements[0] as Rule;
    const eq = rule.body[1]!;
    expect(eq.$type).toBe("Equality");
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("FunctionCall");
      if (eq.expr.$type === "FunctionCall") {
        expect(eq.expr.name).toBe("len");
        expect(eq.expr.args).toHaveLength(1);
      }
    }
  });

  test("subscript expression", () => {
    const program = parse("foo(C) :- bar(X), C = X[0].");
    const rule = program.statements[0] as Rule;
    const eq = rule.body[1]!;
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("Subscript");
    }
  });

  test("slice expression", () => {
    const program = parse("foo(S) :- bar(X), S = X[1:3].");
    const rule = program.statements[0] as Rule;
    const eq = rule.body[1]!;
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("Slice");
      if (eq.expr.$type === "Slice") {
        expect(eq.expr.start).toMatchObject({ $type: "NumberLiteral", value: 1 });
        expect(eq.expr.end).toMatchObject({ $type: "NumberLiteral", value: 3 });
      }
    }
  });

  test("slice with omitted start", () => {
    const program = parse("foo(S) :- bar(X), S = X[:3].");
    const rule = program.statements[0] as Rule;
    const eq = rule.body[1]!;
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("Slice");
      if (eq.expr.$type === "Slice") {
        expect(eq.expr.start).toBeUndefined();
        expect(eq.expr.end).toMatchObject({ $type: "NumberLiteral", value: 3 });
      }
    }
  });

  test("slice with omitted end", () => {
    const program = parse("foo(S) :- bar(X), S = X[1:].");
    const rule = program.statements[0] as Rule;
    const eq = rule.body[1]!;
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("Slice");
      if (eq.expr.$type === "Slice") {
        expect(eq.expr.start).toMatchObject({ $type: "NumberLiteral", value: 1 });
        expect(eq.expr.end).toBeUndefined();
      }
    }
  });

  test("range atom with variable", () => {
    const program = parse("foo(X) :- X in [1 .. 10].");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(1);
    const range = rule.body[0]!;
    expect(range.$type).toBe("RangeAtom");
    if (range.$type === "RangeAtom") {
      expect(range.expr).toMatchObject({ $type: "Variable", name: "X" });
      expect(range.low).toMatchObject({ $type: "NumberLiteral", value: 1 });
      expect(range.high).toMatchObject({ $type: "NumberLiteral", value: 10 });
    }
  });

  test("range atom with expression", () => {
    const program = parse("foo(X) :- bar(X, Y), Y + 1 in [0 .. 100].");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    const range = rule.body[1]!;
    expect(range.$type).toBe("RangeAtom");
    if (range.$type === "RangeAtom") {
      expect(range.expr.$type).toBe("BinaryExpr");
    }
  });

  test("range atom with expression bounds", () => {
    const program = parse("foo(X) :- bar(X, Y), X in [Y .. Y + 10].");
    const rule = program.statements[0] as Rule;
    const range = rule.body[1]!;
    expect(range.$type).toBe("RangeAtom");
    if (range.$type === "RangeAtom") {
      expect(range.low).toMatchObject({ $type: "Variable", name: "Y" });
      expect(range.high.$type).toBe("BinaryExpr");
    }
  });

  test("range atom with function call expression", () => {
    const program = parse("foo(X) :- bar(X), len(X) in [1 .. 10].");
    const rule = program.statements[0] as Rule;
    const range = rule.body[1]!;
    expect(range.$type).toBe("RangeAtom");
    if (range.$type === "RangeAtom") {
      expect(range.expr.$type).toBe("FunctionCall");
    }
  });

  test("aggregate count in head", () => {
    const program = parse("cnt(X, count(Y)) :- bar(X, Y).");
    const rule = program.statements[0] as Rule;
    expect(rule.head.args[0]).toMatchObject({ $type: "Variable", name: "X" });
    const agg = rule.head.args[1] as AggregateCall;
    expect(agg.$type).toBe("AggregateCall");
    expect(agg.func).toBe("count");
    expect(agg.arg).toMatchObject({ $type: "Variable", name: "Y" });
  });

  test("aggregate sum in head", () => {
    const program = parse("total(X, sum(Y)) :- bar(X, Y).");
    const rule = program.statements[0] as Rule;
    const agg = rule.head.args[1] as AggregateCall;
    expect(agg.$type).toBe("AggregateCall");
    expect(agg.func).toBe("sum");
  });

  test("all aggregate functions", () => {
    const funcs: AggregateFunction[] = ["count", "sum", "avg", "min", "max", "group_concat"];
    for (const func of funcs) {
      const program = parse(`r(X, ${func}(Y)) :- bar(X, Y).`);
      const rule = program.statements[0] as Rule;
      const agg = rule.head.args[1] as AggregateCall;
      expect(agg.$type).toBe("AggregateCall");
      expect(agg.func).toBe(func);
    }
  });

  test("aggregate with expression argument", () => {
    const program = parse("total(X, sum(Y * Z)) :- bar(X, Y, Z).");
    const rule = program.statements[0] as Rule;
    const agg = rule.head.args[1] as AggregateCall;
    expect(agg.func).toBe("sum");
    expect(agg.arg.$type).toBe("BinaryExpr");
  });

  test("count with don't-care variable", () => {
    const program = parse("cnt(count(_)) :- bar(_).");
    const rule = program.statements[0] as Rule;
    const agg = rule.head.args[0] as AggregateCall;
    expect(agg.func).toBe("count");
    expect(agg.arg.$type).toBe("Variable");
  });

  test("aggregate names are not aggregates in body position", () => {
    const program = parse("foo(X) :- bar(X), X = min(X, 0).");
    const rule = program.statements[0] as Rule;
    const eq = rule.body[1]!;
    expect(eq.$type).toBe("Equality");
    if (eq.$type === "Equality") {
      expect(eq.expr.$type).toBe("FunctionCall");
      if (eq.expr.$type === "FunctionCall") {
        expect(eq.expr.name).toBe("min");
      }
    }
  });
});
