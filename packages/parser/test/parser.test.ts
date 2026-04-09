import { describe, expect, test } from "bun:test";
import type { ExtDecl, Query, Rule } from "datamog-core";
import { parse } from "../src/index.ts";

describe("parser", () => {
  test("ext declaration", () => {
    const program = parse("extensional parent(name: text, child: text).");
    expect(program.statements).toHaveLength(1);
    const decl = program.statements[0] as ExtDecl;
    expect(decl.kind).toBe("ext_decl");
    expect(decl.predicate).toBe("parent");
    expect(decl.columns).toEqual([
      { name: "name", type: "text" },
      { name: "child", type: "text" },
    ]);
  });

  test("ext declaration with all types", () => {
    const program = parse("extensional t(a: text, b: integer, c: real, d: boolean).");
    const decl = program.statements[0] as ExtDecl;
    expect(decl.columns).toEqual([
      { name: "a", type: "text" },
      { name: "b", type: "integer" },
      { name: "c", type: "real" },
      { name: "d", type: "boolean" },
    ]);
  });

  test("simple rule", () => {
    const program = parse("ancestor(X, Y) :- parent(X, Y).");
    expect(program.statements).toHaveLength(1);
    const rule = program.statements[0] as Rule;
    expect(rule.kind).toBe("rule");
    expect(rule.head.predicate).toBe("ancestor");
    expect(rule.head.args).toHaveLength(2);
    expect(rule.head.args[0]).toMatchObject({ kind: "variable", name: "X" });
    expect(rule.head.args[1]).toMatchObject({ kind: "variable", name: "Y" });
    expect(rule.body).toHaveLength(1);
    expect(rule.body[0]?.predicate).toBe("parent");
  });

  test("rule with multiple body atoms", () => {
    const program = parse("ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    expect(rule.body[0]?.predicate).toBe("parent");
    expect(rule.body[1]?.predicate).toBe("ancestor");
  });

  test("fact (rule with no body)", () => {
    const program = parse('base("x").');
    const rule = program.statements[0] as Rule;
    expect(rule.kind).toBe("rule");
    expect(rule.head.predicate).toBe("base");
    expect(rule.body).toHaveLength(0);
  });

  test("query", () => {
    const program = parse('?- ancestor("alice", X).');
    expect(program.statements).toHaveLength(1);
    const query = program.statements[0] as Query;
    expect(query.kind).toBe("query");
    expect(query.atom.predicate).toBe("ancestor");
    expect(query.atom.args[0]).toMatchObject({ kind: "string", value: "alice" });
    expect(query.atom.args[1]).toMatchObject({ kind: "variable", name: "X" });
  });

  test("number literal in term", () => {
    const program = parse("foo(42, 3.14).");
    const rule = program.statements[0] as Rule;
    expect(rule.head.args[0]).toMatchObject({ kind: "number", value: 42 });
    expect(rule.head.args[1]).toMatchObject({ kind: "number", value: 3.14 });
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
    expect(program.statements[0]?.kind).toBe("ext_decl");
    expect(program.statements[1]?.kind).toBe("rule");
    expect(program.statements[2]?.kind).toBe("rule");
    expect(program.statements[3]?.kind).toBe("query");
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
    expect(headArgs[0]).toMatchObject({ kind: "variable" });
    expect(headArgs[1]).toMatchObject({ kind: "variable" });
    // Each _ should have a distinct generated name
    expect((headArgs[0] as { name: string }).name).not.toBe((headArgs[1] as { name: string }).name);
    // Body _ should also be distinct from head _s
    const bodyArg = rule.body[0]!.args[0]!;
    expect(bodyArg).toMatchObject({ kind: "variable" });
    expect((bodyArg as { name: string }).name).not.toBe((headArgs[0] as { name: string }).name);
    // Named variable X should be preserved
    expect(rule.body[0]!.args[1]).toMatchObject({ kind: "variable", name: "X" });
  });

  test("negated atom in rule body", () => {
    const program = parse("foo(X) :- bar(X), not baz(X).");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    expect(rule.body[0]?.negated).toBeFalsy();
    expect(rule.body[1]?.negated).toBe(true);
    expect(rule.body[1]?.predicate).toBe("baz");
  });

  test("arithmetic expression in atom argument", () => {
    const program = parse("foo(X + 1) :- bar(X).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.kind).toBe("binary");
    if (arg.kind === "binary") {
      expect(arg.op).toBe("+");
      expect(arg.left).toMatchObject({ kind: "variable", name: "X" });
      expect(arg.right).toMatchObject({ kind: "number", value: 1 });
    }
  });

  test("operator precedence: * before +", () => {
    const program = parse("foo(X + Y * 2) :- bar(X, Y).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.kind).toBe("binary");
    if (arg.kind === "binary") {
      expect(arg.op).toBe("+");
      expect(arg.left).toMatchObject({ kind: "variable", name: "X" });
      expect(arg.right.kind).toBe("binary");
    }
  });

  test("unary minus", () => {
    const program = parse("foo(-X) :- bar(X).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.kind).toBe("unary");
    if (arg.kind === "unary") {
      expect(arg.op).toBe("-");
      expect(arg.operand).toMatchObject({ kind: "variable", name: "X" });
    }
  });

  test("parenthesized expression", () => {
    const program = parse("foo((X + 1) * 2) :- bar(X).");
    const rule = program.statements[0] as Rule;
    const arg = rule.head.args[0]!;
    expect(arg.kind).toBe("binary");
    if (arg.kind === "binary") {
      expect(arg.op).toBe("*");
      expect(arg.left.kind).toBe("binary");
      expect(arg.right).toMatchObject({ kind: "number", value: 2 });
    }
  });

  test("equality in rule body", () => {
    const program = parse("foo(X, Z) :- bar(X, Y), Z = Y + 1.");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    const eq = rule.body[1]!;
    expect(eq.kind).toBe("equality");
    if (eq.kind === "equality") {
      expect(eq.variable).toBe("Z");
      expect(eq.expr.kind).toBe("binary");
    }
  });

  test("mod keyword for modulo", () => {
    const program = parse("foo(R) :- bar(X), R = X mod 2.");
    const rule = program.statements[0] as Rule;
    expect(rule.body).toHaveLength(2);
    const eq = rule.body[1]!;
    expect(eq.kind).toBe("equality");
    if (eq.kind === "equality") {
      expect(eq.expr.kind).toBe("binary");
      if (eq.expr.kind === "binary") {
        expect(eq.expr.op).toBe("%");
      }
    }
  });

  test("preserves span on rule", () => {
    const program = parse("foo(X).");
    const rule = program.statements[0] as Rule;
    expect(rule.span.line).toBe(1);
    expect(rule.span.column).toBe(1);
  });
});
