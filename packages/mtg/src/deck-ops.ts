import { z } from "zod";
import { type Zone, zoneSchema } from "./deck";

/** Persisted shape of a deck line (no card data). */
export interface DeckLine {
  oracleId: string;
  zone: Zone;
  qty: number;
  printingId: string | null;
  categories: string[];
  tags: string[];
  finish: "nonfoil" | "foil" | "etched";
}

const finish = z.enum(["nonfoil", "foil", "etched"]);
const id = z.string().min(1);

export const deckOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    oracleId: id,
    qty: z.number().int().min(1).max(999).default(1),
    zone: zoneSchema.default("mainboard"),
    printingId: id.nullish(),
    categories: z.array(z.string()).optional(),
    finish: finish.optional(),
  }),
  z.object({
    op: z.literal("remove"),
    oracleId: id,
    zone: zoneSchema,
    qty: z.number().int().min(1).optional(),
  }),
  z.object({
    op: z.literal("set_qty"),
    oracleId: id,
    zone: zoneSchema,
    qty: z.number().int().min(0).max(999),
  }),
  z.object({
    op: z.literal("move"),
    oracleId: id,
    from: zoneSchema,
    to: zoneSchema,
    qty: z.number().int().min(1).optional(),
  }),
  z.object({
    op: z.literal("set_printing"),
    oracleId: id,
    zone: zoneSchema,
    printingId: id.nullable(),
    finish: finish.optional(),
  }),
  z.object({
    op: z.literal("set_categories"),
    oracleId: id,
    zone: zoneSchema,
    categories: z.array(z.string()),
  }),
  z.object({ op: z.literal("set_tags"), oracleId: id, zone: zoneSchema, tags: z.array(z.string()) }),
  /** Restores a full line exactly (used by inverse operations). */
  z.object({
    op: z.literal("put"),
    line: z.object({
      oracleId: id,
      zone: zoneSchema,
      qty: z.number().int().min(0),
      printingId: id.nullable(),
      categories: z.array(z.string()),
      tags: z.array(z.string()),
      finish,
    }),
  }),
]);
export type DeckOp = z.infer<typeof deckOpSchema>;

const key = (oracleId: string, zone: Zone) => `${zone}|${oracleId}`;

/** Applies operations to deck lines, returning new lines and the inverse operations (in undo order). */
export function applyDeckOps(
  lines: readonly DeckLine[],
  ops: readonly DeckOp[],
): { lines: DeckLine[]; inverse: DeckOp[] } {
  const map = new Map<string, DeckLine>(
    lines.map((l) => [key(l.oracleId, l.zone), { ...l, categories: [...l.categories], tags: [...l.tags] }]),
  );
  const order = lines.map((l) => key(l.oracleId, l.zone));
  const inverse: DeckOp[] = [];
  const snapshot = (oracleId: string, zone: Zone): DeckOp => {
    const cur = map.get(key(oracleId, zone));
    return {
      op: "put",
      line: cur
        ? { ...cur, categories: [...cur.categories], tags: [...cur.tags] }
        : { oracleId, zone, qty: 0, printingId: null, categories: [], tags: [], finish: "nonfoil" },
    };
  };
  const set = (l: DeckLine) => {
    const k = key(l.oracleId, l.zone);
    if (l.qty <= 0) map.delete(k);
    else {
      if (!map.has(k)) order.push(k);
      map.set(k, l);
    }
  };
  for (const op of ops) {
    switch (op.op) {
      case "add": {
        inverse.unshift(snapshot(op.oracleId, op.zone));
        const cur = map.get(key(op.oracleId, op.zone));
        set(
          cur
            ? {
                ...cur,
                qty: cur.qty + op.qty,
                categories: op.categories
                  ? [...new Set([...cur.categories, ...op.categories])]
                  : cur.categories,
              }
            : {
                oracleId: op.oracleId,
                zone: op.zone,
                qty: op.qty,
                printingId: op.printingId ?? null,
                categories: op.categories ?? [],
                tags: [],
                finish: op.finish ?? "nonfoil",
              },
        );
        break;
      }
      case "remove": {
        const cur = map.get(key(op.oracleId, op.zone));
        if (!cur) break;
        inverse.unshift(snapshot(op.oracleId, op.zone));
        set({ ...cur, qty: op.qty === undefined ? 0 : cur.qty - op.qty });
        break;
      }
      case "set_qty": {
        const cur = map.get(key(op.oracleId, op.zone));
        inverse.unshift(snapshot(op.oracleId, op.zone));
        if (cur) set({ ...cur, qty: op.qty });
        else if (op.qty > 0)
          set({
            oracleId: op.oracleId,
            zone: op.zone,
            qty: op.qty,
            printingId: null,
            categories: [],
            tags: [],
            finish: "nonfoil",
          });
        break;
      }
      case "move": {
        if (op.from === op.to) break;
        const cur = map.get(key(op.oracleId, op.from));
        if (!cur) break;
        const n = Math.min(op.qty ?? cur.qty, cur.qty);
        inverse.unshift(snapshot(op.oracleId, op.to));
        inverse.unshift(snapshot(op.oracleId, op.from));
        set({ ...cur, qty: cur.qty - n });
        const dest = map.get(key(op.oracleId, op.to));
        set(dest ? { ...dest, qty: dest.qty + n } : { ...cur, zone: op.to, qty: n });
        break;
      }
      case "set_printing": {
        const cur = map.get(key(op.oracleId, op.zone));
        if (!cur) break;
        inverse.unshift(snapshot(op.oracleId, op.zone));
        set({ ...cur, printingId: op.printingId, finish: op.finish ?? cur.finish });
        break;
      }
      case "set_categories": {
        const cur = map.get(key(op.oracleId, op.zone));
        if (!cur) break;
        inverse.unshift(snapshot(op.oracleId, op.zone));
        set({ ...cur, categories: [...new Set(op.categories.map((c) => c.trim()).filter(Boolean))] });
        break;
      }
      case "set_tags": {
        const cur = map.get(key(op.oracleId, op.zone));
        if (!cur) break;
        inverse.unshift(snapshot(op.oracleId, op.zone));
        set({ ...cur, tags: [...new Set(op.tags.map((c) => c.trim()).filter(Boolean))] });
        break;
      }
      case "put": {
        inverse.unshift(snapshot(op.line.oracleId, op.line.zone));
        set({ ...op.line });
        break;
      }
    }
  }
  const out: DeckLine[] = [];
  for (const k of new Set(order)) {
    const l = map.get(k);
    if (l) out.push(l);
  }
  return { lines: out, inverse };
}

/** Short human summary for the change log. `name` resolves oracle ids to card names. */
export function describeOps(ops: readonly DeckOp[], name: (oracleId: string) => string): string {
  const parts = ops.map((op) => {
    switch (op.op) {
      case "add":
        return `+${op.qty} ${name(op.oracleId)}${op.zone !== "mainboard" ? ` (${op.zone})` : ""}`;
      case "remove":
        return `−${op.qty ?? "all"} ${name(op.oracleId)}`;
      case "set_qty":
        return `${name(op.oracleId)} ×${op.qty}`;
      case "move":
        return `${name(op.oracleId)} ${op.from} → ${op.to}`;
      case "set_printing":
        return `${name(op.oracleId)}: printing changed`;
      case "set_categories":
        return `${name(op.oracleId)}: categories ${op.categories.join(", ") || "cleared"}`;
      case "set_tags":
        return `${name(op.oracleId)}: tags ${op.tags.join(", ") || "cleared"}`;
      default:
        return `${name(op.line.oracleId)} restored`;
    }
  });
  if (parts.length <= 3) return parts.join("; ");
  return `${parts.slice(0, 3).join("; ")} and ${parts.length - 3} more`;
}
