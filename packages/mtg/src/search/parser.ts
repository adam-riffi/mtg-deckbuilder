import type { Ast } from "./ast";
import { lex, type Token } from "./lexer";

/** Parses tokens into an AST: OR binds loosest, then implicit AND, then unary negation. */
export function parseAst(input: string): { ast: Ast | null; errors: string[] } {
  const tokens = lex(input);
  const errors: string[] = [];
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  const parseOr = (): Ast | null => {
    const nodes: Ast[] = [];
    const first = parseAnd();
    if (first) nodes.push(first);
    while (peek()?.kind === "or") {
      pos++;
      const next = parseAnd();
      if (next) nodes.push(next);
      else errors.push("Expected a term after OR.");
    }
    if (nodes.length === 0) return null;
    return nodes.length === 1 ? nodes[0]! : { type: "or", nodes };
  };

  const parseAnd = (): Ast | null => {
    const nodes: Ast[] = [];
    for (;;) {
      const t = peek();
      if (!t || t.kind === "or" || t.kind === "rparen") break;
      const u = parseUnary();
      if (u) nodes.push(u);
    }
    if (nodes.length === 0) return null;
    return nodes.length === 1 ? nodes[0]! : { type: "and", nodes };
  };

  const parseUnary = (): Ast | null => {
    const t = peek();
    if (!t) return null;
    if (t.kind === "neg") {
      pos++;
      const inner = parseUnary();
      if (!inner) {
        errors.push("Dangling '-'.");
        return null;
      }
      return { type: "not", node: inner };
    }
    if (t.kind === "lparen") {
      pos++;
      const inner = parseOr();
      if (peek()?.kind === "rparen") pos++;
      else errors.push("Missing closing parenthesis.");
      return inner;
    }
    if (t.kind === "term") {
      pos++;
      return {
        type: "term",
        key: t.key,
        op: t.op,
        value: t.value,
        quoted: t.quoted,
        regex: t.regex,
        exact: t.exact,
      };
    }
    pos++;
    return null;
  };

  let ast: Ast | null = null;
  const parts: Ast[] = [];
  while (pos < tokens.length) {
    const part = parseOr();
    if (part) parts.push(part);
    if (peek()?.kind === "rparen") {
      errors.push("Unbalanced ')'.");
      pos++;
    }
  }
  if (parts.length === 1) ast = parts[0]!;
  else if (parts.length > 1) ast = { type: "and", nodes: parts };
  return { ast, errors };
}
