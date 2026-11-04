import type { Finish } from "../card";
import type { Zone } from "../deck";
import { parseCsv } from "./csv";

export interface ParsedLine {
  lineNo: number;
  raw: string;
  qty: number;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  scryfallId: string | null;
  finish: Finish;
  zone: Zone;
  categories: string[];
  isCommander: boolean;
}

export interface ParseResult {
  lines: ParsedLine[];
  errors: { lineNo: number; raw: string; message: string }[];
  format: "text" | "csv";
}

const SECTION_RE =
  /^(?:\/\/\s*)?(commanders?|command zone|deck|main(?:board)?|side(?:board)?|maybe(?:board)?|considering|companion|about|tokens?)\s*:?\s*(?:\(\d+\))?$/i;

function sectionZone(s: string): Zone | "skip" | null {
  const m = SECTION_RE.exec(s.trim());
  if (!m) return null;
  const k = m[1]!.toLowerCase();
  if (k.startsWith("command")) return "commander";
  if (k === "deck" || k.startsWith("main")) return "mainboard";
  if (k.startsWith("side")) return "sideboard";
  if (k.startsWith("maybe") || k === "considering") return "maybeboard";
  if (k === "companion") return "companion";
  return "skip";
}

// 1x Name (SET) 123 *F* [Cat1,Cat2{top}] ^Tag^ #tag
const LINE_RE = /^(?:(SB:)\s*)?(\d+)\s*x?\s+(.+?)\s*$/i;

/** Parses one decklist line (without quantity resolution against the DB). */
export function parseLine(raw: string, lineNo: number, zone: Zone): ParsedLine | { error: string } | null {
  let s = raw.trim();
  if (!s || s.startsWith("//") || s.startsWith("#")) return null;
  let z: Zone = zone;
  let qty = 1;
  const m = LINE_RE.exec(s);
  if (m) {
    if (m[1]) z = "sideboard";
    qty = Number(m[2]);
    s = m[3]!;
  }
  let finish: Finish = "nonfoil";
  if (/\*F\*|\(F\)|\bfoil\b\s*$/i.test(s)) finish = "foil";
  if (/\*E\*|\betched\b\s*$/i.test(s)) finish = "etched";
  s = s
    .replace(/\s*\*[FE]\*\s*/gi, " ")
    .replace(/\s+\(F\)\s*$/i, " ")
    .trim();

  const categories: string[] = [];
  let isCommander = false;
  // Archidekt categories: [Ramp,Artifact{noDeck}] ; Moxfield/Archidekt "#tag"
  s = s.replace(/\s*\[([^\]]*)\]\s*$/, (_, cats: string) => {
    for (const c of cats.split(",")) {
      const name = c.replace(/\{[^}]*\}/g, "").trim();
      if (/^commanders?$/i.test(name)) isCommander = true;
      else if (/^(sideboard|maybeboard)$/i.test(name)) z = name.toLowerCase() as Zone;
      else if (name) categories.push(name);
    }
    return "";
  });
  s = s.replace(/\s*\^[^^]*\^\s*/g, " ").trim();
  s = s.replace(/\s+#([\w!-]+)/g, (_, tag: string) => {
    if (tag === "!Commander" || tag.toLowerCase() === "commander") isCommander = true;
    else categories.push(tag.replace(/^!/, ""));
    return "";
  });
  if (/\s\*CMDR\*$/i.test(s)) {
    isCommander = true;
    s = s.replace(/\s\*CMDR\*$/i, "");
  }
  let setCode: string | null = null;
  let collectorNumber: string | null = null;
  // (SET) 123 or [SET] 123 or (SET)
  const setM = /\s+[([]([A-Za-z0-9]{2,6})[)\]](?:\s+([A-Za-z0-9★†-]+))?\s*$/.exec(s);
  if (setM) {
    setCode = setM[1]!.toLowerCase();
    collectorNumber = setM[2] ?? null;
    s = s.slice(0, setM.index).trim();
  }
  if (!s) return { error: "Missing card name." };
  if (qty < 1 || qty > 999) return { error: `Invalid quantity ${qty}.` };
  if (isCommander) z = "commander";
  return {
    lineNo,
    raw,
    qty,
    name: s.replace(/\s+\/\s+/, " // "),
    setCode,
    collectorNumber,
    scryfallId: null,
    finish,
    zone: z,
    categories,
    isCommander,
  };
}

/**
 * Parses plain text, Arena, MTGO, Moxfield and Archidekt text exports, or CSV (auto-detected).
 * In MTGO-style lists a blank line after the main deck starts the sideboard.
 */
export function parseDecklist(text: string): ParseResult {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (
    /,/.test(firstLine) &&
    /\b(name|card name)\b/i.test(firstLine) &&
    /\b(count|quantity|qty)\b/i.test(firstLine)
  )
    return parseCsvDeck(text);

  const lines: ParsedLine[] = [];
  const errors: ParseResult["errors"] = [];
  let zone: Zone = "mainboard";
  let sawExplicitSection = false;
  let blankAfterCards = false;
  let skip = false;
  text.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    const t = raw.trim();
    if (!t) {
      if (lines.length > 0) blankAfterCards = true;
      return;
    }
    const sec = sectionZone(t);
    if (sec) {
      sawExplicitSection = true;
      skip = sec === "skip";
      if (sec !== "skip") zone = sec;
      blankAfterCards = false;
      return;
    }
    if (skip) return;
    if (blankAfterCards && !sawExplicitSection && zone === "mainboard") zone = "sideboard";
    blankAfterCards = false;
    const r = parseLine(raw, lineNo, zone);
    if (!r) return;
    if ("error" in r) errors.push({ lineNo, raw, message: r.error });
    else lines.push(r);
  });
  return { lines, errors, format: "text" };
}

function parseCsvDeck(text: string): ParseResult {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iQty = col("count", "quantity", "qty");
  const iName = col("name", "card name");
  const iSet = col("edition", "set code", "set", "edition code");
  const iNum = col("collector number", "collector_number", "card number", "number");
  const iFoil = col("foil", "finish", "printing");
  const iId = col("scryfall id", "scryfall_id");
  const iBoard = col("board", "zone", "section");
  const iCats = col("categories", "category", "tags");
  const lines: ParsedLine[] = [];
  const errors: ParseResult["errors"] = [];
  rows.slice(1).forEach((r, idx) => {
    const lineNo = idx + 2;
    const raw = r.join(",");
    const name = (r[iName] ?? "").trim();
    if (!name) {
      errors.push({ lineNo, raw, message: "Missing card name." });
      return;
    }
    const qty = iQty >= 0 ? Number(r[iQty]) || 1 : 1;
    const foilRaw = (r[iFoil] ?? "").toLowerCase();
    const finish: Finish = foilRaw.includes("etched")
      ? "etched"
      : foilRaw === "foil" || foilRaw === "true" || foilRaw === "yes" || foilRaw === "1"
        ? "foil"
        : "nonfoil";
    const board = (r[iBoard] ?? "").toLowerCase();
    const zone: Zone = board.startsWith("command")
      ? "commander"
      : board.startsWith("side")
        ? "sideboard"
        : board.startsWith("maybe")
          ? "maybeboard"
          : board.startsWith("companion")
            ? "companion"
            : "mainboard";
    const categories =
      iCats >= 0
        ? (r[iCats] ?? "")
            .split(/[;,|]/)
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
    lines.push({
      lineNo,
      raw,
      qty,
      name,
      setCode: iSet >= 0 && r[iSet] ? r[iSet]!.trim().toLowerCase() : null,
      collectorNumber: iNum >= 0 && r[iNum] ? r[iNum]!.trim() : null,
      scryfallId: iId >= 0 && r[iId] ? r[iId]!.trim() : null,
      finish,
      zone,
      categories,
      isCommander: zone === "commander",
    });
  });
  return { lines, errors, format: "csv" };
}
