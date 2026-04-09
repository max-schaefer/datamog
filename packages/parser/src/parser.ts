import type {
  Atom,
  ColumnDecl,
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

    let body: Atom[] = [];
    if (this.isAt(TokenType.Turnstile)) {
      this.advance();
      body = [this.parseAtom()];
      while (this.isAt(TokenType.Comma)) {
        this.advance();
        body.push(this.parseAtom());
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

  private parseAtom(): Atom {
    const nameToken = this.expect(TokenType.Ident);
    this.expect(TokenType.LParen);

    const args: Term[] = [this.parseTerm()];
    while (this.isAt(TokenType.Comma)) {
      this.advance();
      args.push(this.parseTerm());
    }

    const rparen = this.expect(TokenType.RParen);

    return {
      kind: "atom",
      predicate: nameToken.value,
      args,
      span: { ...nameToken.span, end: rparen.span.end },
    };
  }

  private parseTerm(): Term {
    const token = this.peek();
    switch (token.type) {
      case TokenType.Variable:
        this.advance();
        return { kind: "variable", name: token.value, span: token.span };
      case TokenType.String:
        this.advance();
        return { kind: "string", value: token.value, span: token.span };
      case TokenType.Number:
        this.advance();
        return { kind: "number", value: Number(token.value), span: token.span };
      default:
        throw new ParseError(`Expected term, got '${token.value}'`, token.span);
    }
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
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
