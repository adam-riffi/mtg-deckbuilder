import type { Op } from "./ast";

export type Token =
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "or" }
  | { kind: "neg" }
  | {
      kind: "term";
      key: string | null;
      op: Op;
      value: string;
      quoted: boolean;
      regex: boolean;
      exact: boolean;
    };

const KEY_RE = /^([a-zA-Z_]+)(!=|<=|>=|:|=|<|>)/;

/** Tokenises Scryfall syntax. Never throws: unterminated quotes/regexes run to end of input. */
export function lex(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = input.length;
  const readQuoted = (): string => {
    // at opening quote
    i++;
    let s = "";
    while (i < n && input[i] !== '"') {
      if (input[i] === "\\" && i + 1 < n) {
        s += input[i + 1];
        i += 2;
        continue;
      }
      s += input[i];
      i++;
    }
    i++; // closing quote
    return s;
  };
  const readRegex = (): string => {
    i++;
    let s = "";
    while (i < n && input[i] !== "/") {
      if (input[i] === "\\" && i + 1 < n) {
        s += input[i]! + input[i + 1]!;
        i += 2;
        continue;
      }
      s += input[i];
      i++;
    }
    i++;
    return s;
  };
  const readBare = (): string => {
    let s = "";
    while (i < n && !/\s/.test(input[i]!) && input[i] !== ")" && input[i] !== "(") {
      s += input[i];
      i++;
    }
    return s;
  };

  while (i < n) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      out.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === "-" && i + 1 < n && !/\s/.test(input[i + 1]!)) {
      out.push({ kind: "neg" });
      i++;
      continue;
    }
    if (ch === "!") {
      i++;
      const value = input[i] === '"' ? readQuoted() : readBare();
      out.push({ kind: "term", key: null, op: ":", value, quoted: true, regex: false, exact: true });
      continue;
    }
    if (ch === '"') {
      out.push({
        kind: "term",
        key: null,
        op: ":",
        value: readQuoted(),
        quoted: true,
        regex: false,
        exact: false,
      });
      continue;
    }
    if (ch === "/") {
      out.push({
        kind: "term",
        key: null,
        op: ":",
        value: readRegex(),
        quoted: false,
        regex: true,
        exact: false,
      });
      continue;
    }
    const km = KEY_RE.exec(input.slice(i));
    if (km) {
      i += km[0].length;
      const key = km[1]!.toLowerCase();
      const op = km[2] as Op;
      let value = "";
      let quoted = false;
      let regex = false;
      if (input[i] === '"') {
        value = readQuoted();
        quoted = true;
      } else if (input[i] === "/") {
        value = readRegex();
        regex = true;
      } else value = readBare();
      out.push({ kind: "term", key, op, value, quoted, regex, exact: false });
      continue;
    }
    const word = readBare();
    if (word.toLowerCase() === "or") out.push({ kind: "or" });
    else if (word.toLowerCase() === "and") continue;
    else if (word)
      out.push({ kind: "term", key: null, op: ":", value: word, quoted: false, regex: false, exact: false });
    else i++;
  }
  return out;
}
