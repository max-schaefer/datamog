import type {
  Atom,
  BinaryOp,
  BodyElement,
  ColumnDecl,
  Equality,
  ExtDecl,
  Program,
  Query,
  Rule,
  SqlType,
  Statement,
  Term,
} from "datamog-core";
import { ParseError } from "./errors.ts";
import { type Token, TokenType } from "./lexer.ts";

export class Parser {
  private pos = 0;
  private anonCounter = 0;

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
    const head = this.parseAtom();

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
   * Parse a body element: either an atom (possibly negated), or an equality (Variable = expr).
   *
   * The ambiguity: a Variable followed by `=` is an equality, otherwise it could be
   * an argument. But body elements at the top level are either `[not] ident(...)` or `Var = expr`.
   */
  private parseBodyElement(): BodyElement {
    // Negated atom: not ident(...)
    if (this.isAt(TokenType.Not)) {
      this.advance();
      const atom = this.parseAtom();
      return { ...atom, negated: true };
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

    // Atom: ident(...)
    return this.parseAtom();
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
    return this.parsePrimary();
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
