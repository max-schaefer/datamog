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

  test("preserves span on rule", () => {
    const program = parse("foo(X).");
    const rule = program.statements[0] as Rule;
    expect(rule.span.line).toBe(1);
    expect(rule.span.column).toBe(1);
  });
});
