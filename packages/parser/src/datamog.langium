grammar Datamog

// =============================================================================
// Datamog — an educational Datalog dialect
//
// Extensional declarations define table-backed predicates.
// Rules compile to SQL views (including recursive views).
// Queries execute SELECT statements against the generated views.
// =============================================================================

entry Program:
    statements+=Statement*;

// --- Statements --------------------------------------------------------------

Statement:
    ExtDecl | Rule | Query;

ExtDecl:
    'extensional' predicate=IDENT '(' columns+=ColumnDecl (',' columns+=ColumnDecl)* ')' '.';

ColumnDecl:
    name=IDENT ':' type=SqlType;

SqlType returns string:
    'text' | 'integer' | 'real' | 'boolean';

Rule:
    head=HeadAtom (':-' body+=BodyElement (',' body+=BodyElement)*)? '.';

Query:
    '?-' atom=Atom '.';

// --- Head (allows aggregates) ------------------------------------------------

HeadAtom:
    predicate=IDENT '(' args+=HeadTerm (',' args+=HeadTerm)* ')';

HeadTerm:
    AggregateCall | Expression;

AggregateCall:
    func=IDENT '(' arg=Expression ')';

// --- Body elements -----------------------------------------------------------

BodyElement:
    Atom | Equality | Comparison | RangeAtom;

// Atom with optional negation
Atom:
    (negated?='not')? predicate=IDENT '(' args+=Expression (',' args+=Expression)* ')';

Equality:
    variable=VARIABLE '=' expr=Expression;

Comparison:
    left=Expression op=ComparisonOp right=Expression;

ComparisonOp returns string:
    '<' | '>' | '<=' | '>=' | '!=';

RangeAtom:
    expr=Expression 'in' '[' low=Expression '..' high=Expression ']';

// --- Expressions (precedence climbing) ---------------------------------------

Expression:
    Addition;

Addition infers Expression:
    Multiplication ({infer BinaryExpr.left=current} op=('+' | '-') right=Multiplication)*;

Multiplication infers Expression:
    UnaryExpr ({infer BinaryExpr.left=current} op=('*' | '/' | 'mod') right=UnaryExpr)*;

UnaryExpr infers Expression:
    {infer UnaryExpr} op='-' operand=UnaryExpr
    | Postfix;

Postfix infers Expression:
    Primary
    (
        {infer Subscript.object=current} '[' index=Expression ']'
      | {infer Slice.object=current} '[' start=Expression? ':' end=Expression? ']'
    )*;

Primary infers Expression:
    '(' Expression ')'
    | FunctionCall
    | {infer Variable} name=VARIABLE
    | {infer StringLiteral} value=STRING
    | {infer NumberLiteral} value=NUMBER;

FunctionCall:
    name=IDENT '(' args+=Expression (',' args+=Expression)* ')';

// --- Terminals ---------------------------------------------------------------

terminal VARIABLE: /[A-Z_][a-zA-Z0-9_]*/;
terminal IDENT: /[a-z][a-zA-Z0-9_]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?/;

hidden terminal WS: /[\t\r\n ]+/;
hidden terminal COMMENT: /%[^\n\r]*/;
