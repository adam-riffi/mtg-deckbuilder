import type { DeckEntry, Zone } from "../deck";
import { toCsv } from "./csv";

export const EXPORT_FORMATS = ["text", "arena", "mtgo", "moxfield", "archidekt", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const ORDER: Zone[] = ["commander", "companion", "mainboard", "sideboard", "maybeboard"];
const HEAD: Record<Zone, string> = {
  commander: "Commander",
  companion: "Companion",
  mainboard: "Deck",
  sideboard: "Sideboard",
  maybeboard: "Maybeboard",
};

function byZone(entries: readonly DeckEntry[]): Map<Zone, DeckEntry[]> {
  const m = new Map<Zone, DeckEntry[]>();
  for (const z of ORDER) m.set(z, []);
  for (const e of entries) m.get(e.zone)!.push(e);
  for (const list of m.values()) list.sort((a, b) => a.card.name.localeCompare(b.card.name));
  return m;
}

const setPart = (e: DeckEntry, lower = false) =>
  e.printing
    ? ` (${lower ? e.printing.setCode.toLowerCase() : e.printing.setCode.toUpperCase()}) ${e.printing.collectorNumber}`
    : "";

/** Exports a deck. Arena/MTGO omit the maybeboard since those clients do not support it. */
export function exportDeck(entries: readonly DeckEntry[], format: ExportFormat): string {
  const zones = byZone(entries);
  const sections: string[] = [];
  if (format === "csv") {
    const rows: (string | number | null)[][] = [
      ["Quantity", "Name", "Set", "Collector Number", "Finish", "Zone", "Categories", "Scryfall ID"],
    ];
    for (const z of ORDER)
      for (const e of zones.get(z)!)
        rows.push([
          e.qty,
          e.card.name,
          e.printing?.setCode ?? null,
          e.printing?.collectorNumber ?? null,
          e.finish,
          z,
          e.categories.join(";"),
          e.printing?.id ?? null,
        ]);
    return toCsv(rows);
  }
  if (format === "mtgo") {
    const main = [...zones.get("commander")!, ...zones.get("mainboard")!].map(
      (e) => `${e.qty} ${e.card.name}`,
    );
    const side = [...zones.get("companion")!, ...zones.get("sideboard")!].map(
      (e) => `${e.qty} ${e.card.name}`,
    );
    return [main.join("\n"), side.join("\n")].filter(Boolean).join("\n\n");
  }
  for (const z of ORDER) {
    const list = zones.get(z)!;
    if (!list.length) continue;
    if (format === "arena" && z === "maybeboard") continue;
    const lines = list.map((e) => {
      switch (format) {
        case "arena":
          return `${e.qty} ${e.card.name}${setPart(e)}`;
        case "moxfield":
          return `${e.qty} ${e.card.name}${setPart(e)}${e.finish === "foil" ? " *F*" : e.finish === "etched" ? " *E*" : ""}`;
        case "archidekt": {
          const cats = [
            ...(z === "commander"
              ? ["Commander"]
              : z === "sideboard"
                ? ["Sideboard"]
                : z === "maybeboard"
                  ? ["Maybeboard"]
                  : []),
            ...e.categories,
          ];
          return `${e.qty}x ${e.card.name}${setPart(e, true)}${e.finish === "foil" ? " *F*" : ""}${cats.length ? ` [${cats.join(",")}]` : ""}`;
        }
        default:
          return `${e.qty} ${e.card.name}`;
      }
    });
    sections.push(format === "archidekt" ? lines.join("\n") : `${HEAD[z]}\n${lines.join("\n")}`);
  }
  return sections.join(format === "archidekt" ? "\n" : "\n\n");
}
