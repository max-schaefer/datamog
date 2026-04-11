import type {
  AggregateFunction,
  Atom,
  BinaryOp,
  BodyElement,
  ColumnDecl,
  Comparison,
  ComparisonOp,
  Equality,
  ExtDecl,
  Program,
  Query,
  RangeAtom,
  Rule,
  SqlType,
  Statement,
  Term,
} from "datamog-core";
import { ParseError } from "./errors.ts";
import { type Token, TokenType } from "./lexer.ts";

const AGGREGATE_FUNCTIONS = new Set<string>(["count", "sum", "avg", "min", "max", "group_concat"]);

export class Parser {
  private pos = 0;
  private anonCounter = 0;
  private parsingHead = false;

  constructor(private tokens: Token[]) {}

  parse(): Program {
    const statements: Statement[] = [];
    while (!this.isAt(TokenType.EOF)) {
      statements.push(this.parseStatement());
    }
    return { statements };
  }

  private parseStatement(): Statement {
    if (this.isAt(TokenType.Extensional)) {
      return this.parseExtDecl();
    }
    if (this.isAt(TokenType.QueryMark)) {
      return this.parseQuery();
    }
    if (this.isAt(TokenType.Ident)) {
      return this.parseRuleOrFact();
    }
    throw new ParseError(
      `Expected statement, got '${this.peek().value || this.peek().type}'`,
      this.peek().span,
    );
  }

  private parseExtDecl(): ExtDecl {
    const start = this.expect(TokenType.Extensional);
    const predicate = this.expect(TokenType.Ident).value;
    this.expect(TokenType.LParen);

    const columns: ColumnDecl[] = [this.parseColumnDecl()];
    while (this.isAt(TokenType.Comma)) {
      this.advance();
      columns.push(this.parseColumnDecl());
    }

    this.expect(TokenType.RParen);
    this.expect(TokenType.Dot);

    return {
      kind: "ext_decl",
      predicate,
      columns,
      span: { ...start.span, end: this.tokens[this.pos - 1]!.span.end },
    };
  }

  private parseColumnDecl(): ColumnDecl {
    const name = this.expect(TokenType.Ident).value;
    this.expect(TokenType.Colon);
    const type = this.parseType();
    return { name, type };
  }

  private parseType(): SqlType {
    const token = this.peek();
    switch (token.type) {
      case TokenType.TextType:
        this.advance();
        return "text";
      case TokenType.IntegerType:
        this.advance();
        return "integer";
      case TokenType.RealType:
        this.advance();
        return "real";
      case TokenType.BooleanType:
        this.advance();
        return "boolean";
      default:
        throw new ParseError(`Expected type, got '${token.value}'`, token.span);
    }
  }

  private parseRuleOrFact(): Rule {
    this.parsingHead = true;
    const head = this.parseAtom();
    this.parsingHead = false;

    let body: BodyElement[] = [];
    if (this.isAt(TokenType.Turnstile)) {
      this.advance();
      body = [this.parseBodyElement()];
      while (this.isAt(TokenType.Comma)) {
        this.advance();
        body.push(this.parseBodyElement());
      }
    }

    this.expect(TokenType.Dot);

    return {
      kind: "rule",
      head,
      body,
      span: { ...head.span, end: this.tokens[this.pos - 1]!.span.end },
    };
  }

  private parseQuery(): Query {
    const start = this.expect(TokenType.QueryMark);
    const atom = this.parseAtom();
    this.expect(TokenType.Dot);

    return {
      kind: "query",
      atom,
      span: { ...start.span, end: this.tokens[this.pos - 1]!.span.end },
    };
  }

  /**
   * Parse a body element: atom, negated atom, equality, or comparison.
   *
   * Disambiguation:
   * - `not ident(...)` → negated atom
   * - `ident(...)` → atom (ident followed by lparen)
   * - `Variable = expr` → equality (binding)
   * - `expr <op> expr` → comparison (where <op> is <, >, <=, >=, !=)
   */
  private parseBodyElement(): BodyElement {
    // Negated atom: not ident(...)
    if (this.isAt(TokenType.Not)) {
      this.advance();
      const atom = this.parseAtom();
      return { ...atom, negated: true };
    }

    // Atom: ident(...) — but only if not followed by a comparison operator or 'in'
    // (which would make it a function call in a comparison/range, e.g. len(X) >= 3)
    if (this.isAt(TokenType.Ident) && this.peekAt(1)?.type === TokenType.LParen) {
      const saved = this.pos;
      const atom = this.parseAtom();
      if (this.isComparisonOp() || this.isAt(TokenType.In)) {
        // Reinterpret as comparison or range: function call on left side
        this.pos = saved;
        return this.parseComparisonOrRange();
      }
      return atom;
    }

    // Equality: Variable = expr
    if (this.isAt(TokenType.Variable) && this.peekAt(1)?.type === TokenType.Equals) {
      const varToken = this.advance();
      this.advance(); // consume =
      const expr = this.parseExpr();
      const name = varToken.value === "_" ? `_${this.anonCounter++}` : varToken.value;
      return {
        kind: "equality",
        variable: name,
        expr,
        span: { ...varToken.span, end: this.tokens[this.pos - 1]!.span.end },
      } satisfies Equality;
    }

    // Comparison or range: expr <op> expr, or expr in [expr .. expr]
    return this.parseComparisonOrRange();
  }

  private parseComparisonOrRange(): Comparison | RangeAtom {
    const left = this.parseExpr();
    if (this.isAt(TokenType.In)) {
      this.advance(); // consume 'in'
      this.expect(TokenType.LBracket);
      const low = this.parseExpr();
      this.expect(TokenType.DotDot);
      const high = this.parseExpr();
      const rbracket = this.expect(TokenType.RBracket);
      return {
        kind: "range",
        expr: left,
        low,
        high,
        span: { ...left.span, end: rbracket.span.end },
      } satisfies RangeAtom;
    }
    const op = this.parseComparisonOp();
    const right = this.parseExpr();
    return {
      kind: "comparison",
      op,
      left,
      right,
      span: { ...left.span, end: right.span.end },
    };
  }

  private isComparisonOp(): boolean {
    const t = this.peek().type;
    return (
      t === TokenType.Lt ||
      t === TokenType.Gt ||
      t === TokenType.LtEq ||
      t === TokenType.GtEq ||
      t === TokenType.NotEq
    );
  }

  private parseComparisonOp(): ComparisonOp {
    const token = this.peek();
    switch (token.type) {
      case TokenType.Lt:
        this.advance();
        return "<";
      case TokenType.Gt:
        this.advance();
        return ">";
      case TokenType.LtEq:
        this.advance();
        return "<=";
      case TokenType.GtEq:
        this.advance();
        return ">=";
      case TokenType.NotEq:
        this.advance();
        return "!=";
      default:
        throw new ParseError(`Expected comparison operator, got '${token.value}'`, token.span);
    }
  }

  private parseAtom(): Atom {
    const nameToken = this.expect(TokenType.Ident);
    this.expect(TokenType.LParen);

    const args: Term[] = [this.parseExpr()];
    while (this.isAt(TokenType.Comma)) {
      this.advance();
      args.push(this.parseExpr());
    }

    const rparen = this.expect(TokenType.RParen);

    return {
      kind: "atom",
      predicate: nameToken.value,
      args,
      span: { ...nameToken.span, end: rparen.span.end },
    };
  }

  // --- Expression parsing (precedence climbing) ---

  /** Parse an expression: additive level (lowest precedence). */
  private parseExpr(): Term {
    return this.parseAdditive();
  }

  private parseAdditive(): Term {
    let left = this.parseMultiplicative();
    while (this.isAt(TokenType.Plus) || this.isAt(TokenType.Minus)) {
      const opToken = this.advance();
      const op = opToken.value as BinaryOp;
      const right = this.parseMultiplicative();
      left = {
        kind: "binary",
        op,
        left,
        right,
        span: { ...left.span, end: right.span.end },
      };
    }
    return left;
  }

  private parseMultiplicative(): Term {
    let left = this.parseUnary();
    while (
      this.isAt(TokenType.Star) ||
      this.isAt(TokenType.Slash) ||
      this.isAt(TokenType.Percent)
    ) {
      const opToken = this.advance();
      const op = (opToken.type === TokenType.Percent ? "%" : opToken.value) as BinaryOp;
      const right = this.parseUnary();
      left = {
        kind: "binary",
        op,
        left,
        right,
        span: { ...left.span, end: right.span.end },
      };
    }
    return left;
  }

  private parseUnary(): Term {
    if (this.isAt(TokenType.Minus)) {
      const opToken = this.advance();
      const operand = this.parseUnary();
      return {
        kind: "unary",
        op: "-",
        operand,
        span: { ...opToken.span, end: operand.span.end },
      };
    }
    return this.parsePostfix();
  }

  /** Parse postfix operations: subscript X[N] and slice X[A:B]. */
  private parsePostfix(): Term {
    let expr = this.parsePrimary();

    while (this.isAt(TokenType.LBracket)) {
      this.advance(); // consume [

      if (this.isAt(TokenType.Colon)) {
        // [:end]
        this.advance();
        const end = this.isAt(TokenType.RBracket) ? undefined : this.parseExpr();
        const rbracket = this.expect(TokenType.RBracket);
        expr = {
          kind: "slice",
          object: expr,
          end,
          span: { ...expr.span, end: rbracket.span.end },
        };
      } else {
        const indexOrStart = this.parseExpr();
        if (this.isAt(TokenType.Colon)) {
          // [start:end] or [start:]
          this.advance();
          const end = this.isAt(TokenType.RBracket) ? undefined : this.parseExpr();
          const rbracket = this.expect(TokenType.RBracket);
          expr = {
            kind: "slice",
            object: expr,
            start: indexOrStart,
            end,
            span: { ...expr.span, end: rbracket.span.end },
          };
        } else {
          // [index]
          const rbracket = this.expect(TokenType.RBracket);
          expr = {
            kind: "subscript",
            object: expr,
            index: indexOrStart,
            span: { ...expr.span, end: rbracket.span.end },
          };
        }
      }
    }

    return expr;
  }

  private parsePrimary(): Term {
    const token = this.peek();

    // Parenthesized expression
    if (token.type === TokenType.LParen) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TokenType.RParen);
      return expr;
    }

    // Aggregate call in head position: count(X), sum(X), etc.
    if (
      this.parsingHead &&
      token.type === TokenType.Ident &&
      AGGREGATE_FUNCTIONS.has(token.value) &&
      this.peekAt(1)?.type === TokenType.LParen
    ) {
      const nameToken = this.advance();
      this.advance(); // consume (
      const arg = this.parseExpr();
      const rparen = this.expect(TokenType.RParen);
      return {
        kind: "aggregate",
        func: nameToken.value as AggregateFunction,
        arg,
        span: { ...nameToken.span, end: rparen.span.end },
      };
    }

    // Function call: ident(args)
    if (token.type === TokenType.Ident && this.peekAt(1)?.type === TokenType.LParen) {
      const nameToken = this.advance();
      this.advance(); // consume (
      const args: Term[] = [this.parseExpr()];
      while (this.isAt(TokenType.Comma)) {
        this.advance();
        args.push(this.parseExpr());
      }
      const rparen = this.expect(TokenType.RParen);
      return {
        kind: "call",
        name: nameToken.value,
        args,
        span: { ...nameToken.span, end: rparen.span.end },
      };
    }

    switch (token.type) {
      case TokenType.Variable: {
        this.advance();
        const name = token.value === "_" ? `_${this.anonCounter++}` : token.value;
        return { kind: "variable", name, span: token.span };
      }
      case TokenType.String:
        this.advance();
        return { kind: "string", value: token.value, span: token.span };
      case TokenType.Number:
        this.advance();
        return { kind: "number", value: Number(token.value), span: token.span };
      default:
        throw new ParseError(`Expected expression, got '${token.value}'`, token.span);
    }
  }

  // --- Utilities ---

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private peekAt(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  private isAt(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ParseError(
        `Expected ${TokenType[type]}, got '${token.value || TokenType[token.type]}'`,
        token.span,
      );
    }
    return this.advance();
  }
}
