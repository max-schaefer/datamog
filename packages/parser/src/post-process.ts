import { type AstNode, AstUtils } from "langium";
import type {
  AggregateCall,
  BracketAccess,
  Program,
  Slice,
  Subscript,
  UnaryExpr,
} from "./generated/ast.js";
import {
  isBracketAccess,
  isColumnDecl,
  isExtDecl,
  isFilter,
  isFunctionCall,
  isHeadAtom,
  isLiteral,
  isNumberLiteral,
  isQuery,
  isRule,
  isVariable,
} from "./generated/ast.js";
import { ParseError } from "./parse-error.js";

// Post-processing attaches the original source text of numeric literals on
// `rawText` so the translator can distinguish `1` from `1.0`. Declaration
// merging makes the field a first-class part of the generated interface so
// callers don't have to cast.
declare module "./generated/ast.js" {
  interface Literal {
    predicateQuoted?: boolean;
  }

  interface ColumnDecl {
    nameQuoted?: boolean;
  }

  interface ExtDecl {
    predicateQuoted?: boolean;
  }

  interface HeadAtom {
    predicateQuoted?: boolean;
  }

  interface NumberLiteral {
    rawText?: string;
  }
}

// Intermediate shape of a BracketAccess node while the post-processor rewrites
// it in place into a Subscript or Slice: `$type` becomes the wider runtime
// union, `index` is filled in for Subscripts, and `sliceColon`/`start` are
// cleared.
type MutableBracketAccess = Omit<BracketAccess, "$type" | "sliceColon"> & {
  $type: BracketAccess["$type"] | Subscript["$type"] | Slice["$type"];
  index?: Subscript["index"];
  sliceColon?: boolean;
};

const AGGREGATE_NAMES = new Set(["count", "sum", "avg", "min", "max", "concat", "list"]);

function isQuotedIdentifier(value: string): boolean {
  return value.length >= 2 && value.startsWith("`") && value.endsWith("`");
}

function decodeQuotedIdentifier(value: string): string {
  if (!isQuotedIdentifier(value)) return value;
  return value.slice(1, -1).replace(/\\([\s\S])/g, "$1");
}

function parseErrorAtNode(message: string, node: { $cstNode?: AstNode["$cstNode"] }): ParseError {
  const cst = node.$cstNode;
  const line = cst ? cst.range.start.line + 1 : 1;
  const col = cst ? cst.range.start.character + 1 : 1;
  const err = new ParseError(message, line, col, cst?.offset);
  if (cst?.end !== undefined) err.end = cst.end;
  return err;
}

/**
 * Post-parse transforms applied to the Langium AST:
 * 1. Desugar don't-care variables: rename every `_` to a unique internal name.
 * 2. Preserve the source text of numeric literals on a `rawText` property so the
 *    translator can distinguish `1` (integer) from `1.0` (float) — information
 *    that is otherwise lost when the lexer coerces NUMBER to a JS `number`.
 * 3. Recognise aggregate calls in rule heads: the grammar parses head args
 *    as plain `Expression` (to avoid an ambiguity between AggregateCall and
 *    FunctionCall — both start with IDENT '('), and this pass rewrites
 *    single-argument FunctionCall nodes whose name is an aggregate into
 *    AggregateCall nodes.
 * 4. Split BracketAccess nodes into Subscript or Slice based on whether a
 *    colon was seen inside the brackets. The grammar parses `W[...]` as a
 *    unified BracketAccess to avoid a Subscript-vs-Slice LL(k) ambiguity
 *    that surfaced for `W[0:-1]` and `W[:-1]`.
 * 5. Desugar negated filters: a body literal `not <expr>` whose atom is a
 *    built-in (a comparison like `not X = Y`) parses as a Filter with
 *    `negated` set. Rewrite it into an ordinary Filter over `!(<expr>)` so
 *    the analyzer, translator, and evaluators see only the logical-not path
 *    they already implement. (Negated predicate calls keep their own
 *    `Literal.negated` flag — they are negation-as-failure, not `!`.)
 */
export function postProcess(program: Program): void {
  for (const node of streamAll(program)) {
    if (isExtDecl(node)) {
      node.predicateQuoted = isQuotedIdentifier(node.predicate);
      node.predicate = decodeQuotedIdentifier(node.predicate);
    } else if (isHeadAtom(node)) {
      node.predicateQuoted = isQuotedIdentifier(node.predicate);
      node.predicate = decodeQuotedIdentifier(node.predicate);
    } else if (isLiteral(node)) {
      node.predicateQuoted = isQuotedIdentifier(node.predicate);
      node.predicate = decodeQuotedIdentifier(node.predicate);
    } else if (isColumnDecl(node)) {
      node.nameQuoted = isQuotedIdentifier(node.name);
      node.name = decodeQuotedIdentifier(node.name);
    } else if (isVariable(node)) {
      // Strip backticks so `Foo` and Foo are indistinguishable downstream
      // (analyzer, translator, evaluators). Reserved keywords are matched
      // as their own token kind by the lexer, so the only way a variable
      // can carry a keyword-looking name is via the quoted form (`true`),
      // which the analyzer treats as an ordinary identifier — no
      // re-tokenisation downstream means no name collision.
      node.name = decodeQuotedIdentifier(node.name);
    }
  }

  // Collect every user-written variable name first, so renaming the
  // don't-care `_`s can avoid picking a name that already exists in the
  // program. The generated `$anonN` names are not valid source-level
  // variables, but the collision check keeps the transform robust if a
  // caller constructs ASTs directly.
  const usedNames = new Set<string>();
  for (const node of streamAll(program)) {
    if (isVariable(node) && node.name !== "_") {
      usedNames.add(node.name);
    }
  }

  let anonCounter = 0;
  const freshAnon = (): string => {
    let name = `$anon${anonCounter++}`;
    while (usedNames.has(name)) {
      name = `$anon${anonCounter++}`;
    }
    return name;
  };

  for (const node of streamAll(program)) {
    if (isVariable(node) && node.name === "_") {
      node.name = freshAnon();
    }
    if (isNumberLiteral(node)) {
      const text = node.$cstNode?.text;
      // A binary literal (`0b1010`) is tokenised as NUMBER, but the lexer's
      // numeric coercion doesn't understand the `0b` prefix. Compute its value
      // and normalise `rawText` to the decimal form, so every later stage
      // (types, translator, interpreters) sees an ordinary integer literal.
      if (text !== undefined && /^0[bB][01]+$/.test(text)) {
        (node as { value: number }).value = Number.parseInt(text.slice(2), 2);
        node.rawText = String(node.value);
      } else if (text !== undefined) {
        node.rawText = text;
      }
      const written = node.rawText ?? text ?? String(node.value);
      if (!Number.isFinite(node.value)) {
        throw parseErrorAtNode(
          `Numeric literal '${written}' is outside the finite number range`,
          node,
        );
      }
      if (!/[.eE]/.test(written) && !Number.isSafeInteger(node.value)) {
        throw parseErrorAtNode(
          `Integer literal '${written}' is outside the safe integer range`,
          node,
        );
      }
    }
    if (isBracketAccess(node)) {
      // Rewrite the node's $type in place. `sliceColon` means we saw a
      // `:`, so this is a Slice (possibly with omitted start or end).
      // Otherwise the `start` field is the Subscript's index. `$type`
      // is declared readonly on the generated interface; the
      // MutableBracketAccess alias relaxes it just for this rewrite.
      const bracket = node as MutableBracketAccess;
      if (bracket.sliceColon) {
        bracket.$type = "Slice";
      } else {
        // `W[]` is permitted by the grammar (both `start` and `sliceColon`
        // are optional), but a Subscript with no index can't be
        // translated. Reject it here with a `ParseError` carrying a
        // numeric `offset` / `end` so the playground squiggly lands at
        // the `[]` token — a bare `Error` would lose the position and
        // default to byte 0.
        if (!bracket.start) {
          throw parseErrorAtNode("Empty bracket access '[]' is not allowed", bracket);
        }
        bracket.$type = "Subscript";
        bracket.index = bracket.start;
        bracket.start = undefined;
      }
      bracket.sliceColon = undefined;
    }
  }

  // Desugar negated filters (`not X = Y`) into `!(...)` over the same
  // expression. Predicate-call literals are negated via `Literal.negated`
  // and are left untouched here.
  for (const stmt of program.statements) {
    const body = isRule(stmt) ? stmt.body : isQuery(stmt) ? stmt.body : undefined;
    if (!body) continue;
    for (const element of body) {
      if (!isFilter(element) || !element.negated) continue;
      const inner = element.expr;
      const negation: UnaryExpr = {
        $type: "UnaryExpr",
        $container: element,
        $containerProperty: "expr",
        $cstNode: element.$cstNode,
        op: "!",
        operand: inner,
      };
      (inner as { $container: AstNode }).$container = negation;
      (inner as { $containerProperty?: string }).$containerProperty = "operand";
      (inner as { $containerIndex?: number }).$containerIndex = undefined;
      element.expr = negation;
      element.negated = false;
    }
  }

  // Rewrite aggregate FunctionCalls in rule heads into AggregateCall nodes.
  for (const rule of program.statements) {
    if (!isRule(rule)) continue;
    for (let i = 0; i < rule.head.args.length; i++) {
      const arg = rule.head.args[i]!;
      if (isFunctionCall(arg) && AGGREGATE_NAMES.has(arg.name) && arg.args.length === 1) {
        const aggArg = arg.args[0]!;
        const aggregate: AggregateCall = {
          $type: "AggregateCall",
          $container: rule.head,
          $containerProperty: "args",
          $containerIndex: i,
          $cstNode: arg.$cstNode,
          func: arg.name,
          arg: aggArg,
        };
        (aggArg as { $container: AstNode }).$container = aggregate;
        // The grammar types head args as Expression[]; after this rewrite
        // the array can contain AggregateCall nodes. Downstream callers
        // (datamog-core) widen HeadAtom.args back to include them.
        (rule.head.args as unknown as (typeof aggregate | typeof arg)[])[i] = aggregate;
      }
    }
  }
}

/** Yield all AST nodes in the tree (depth-first). */
function* streamAll(root: AstNode): Generator<AstNode> {
  yield root;
  yield* AstUtils.streamAllContents(root);
}
