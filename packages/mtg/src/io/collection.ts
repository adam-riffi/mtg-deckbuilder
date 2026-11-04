import type { Finish } from "../card";
import { parseCsv } from "./csv";

export interface CollectionCsvRow {
  lineNo: number;
  qty: number;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  scryfallId: string | null;
  finish: Finish;
  condition: string;
  language: string;
}

const CONDITIONS: Record<string, string> = {
  mint: "M",
  m: "M",
  near_mint: "NM",
  "near mint": "NM",
  nm: "NM",
  excellent: "EX",
  ex: "EX",
  lightly_played: "LP",
  "lightly played": "LP",
  lp: "LP",
  good: "GD",
  played: "PL",
  moderately_played: "MP",
  "moderately played": "MP",
  mp: "MP",
  heavily_played: "HP",
  "heavily played": "HP",
  hp: "HP",
  damaged: "DMG",
  poor: "DMG",
  dmg: "DMG",
};

/** Parses Moxfield, Archidekt and ManaBox collection CSV exports (column names are matched case-insensitively). */
export function parseCollectionCsv(text: string): {
  rows: CollectionCsvRow[];
  errors: { lineNo: number; message: string }[];
  source: string;
} {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (...n: string[]) => header.findIndex((h) => n.includes(h));
  const i = {
    qty: col("count", "quantity", "qty"),
    name: col("name", "card name"),
    set: col("edition code", "set code", "edition", "set"),
    num: col("collector number", "card number", "number"),
    id: col("scryfall id", "scryfall_id"),
    foil: col("foil", "finish", "printing"),
    cond: col("condition"),
    lang: col("language", "lang"),
  };
  const source = header.includes("manabox id")
    ? "ManaBox"
    : header.includes("tradelist count")
      ? "Moxfield"
      : header.includes("edition name")
        ? "Archidekt"
        : "CSV";
  const out: CollectionCsvRow[] = [];
  const errors: { lineNo: number; message: string }[] = [];
  if (i.name < 0) return { rows: [], errors: [{ lineNo: 1, message: "No Name column found." }], source };
  rows.slice(1).forEach((r, k) => {
    const lineNo = k + 2;
    const name = (r[i.name] ?? "").trim();
    if (!name) {
      errors.push({ lineNo, message: "Missing name." });
      return;
    }
    const foilRaw = (r[i.foil] ?? "").trim().toLowerCase();
    const finish: Finish = foilRaw.includes("etched")
      ? "etched"
      : ["foil", "true", "yes", "1"].includes(foilRaw)
        ? "foil"
        : "nonfoil";
    const condRaw = (r[i.cond] ?? "").trim().toLowerCase();
    const lang = (r[i.lang] ?? "en").trim().toLowerCase();
    out.push({
      lineNo,
      qty: Math.max(1, Number(r[i.qty]) || 1),
      name,
      setCode: i.set >= 0 && r[i.set]?.trim() ? r[i.set]!.trim().toLowerCase() : null,
      collectorNumber: i.num >= 0 && r[i.num]?.trim() ? r[i.num]!.trim() : null,
      scryfallId: i.id >= 0 && r[i.id]?.trim() ? r[i.id]!.trim() : null,
      finish,
      condition: CONDITIONS[condRaw] ?? (condRaw ? condRaw.toUpperCase().slice(0, 4) : "NM"),
      language: lang === "english" ? "en" : lang.slice(0, 5) || "en",
    });
  });
  return { rows: out, errors, source };
}
