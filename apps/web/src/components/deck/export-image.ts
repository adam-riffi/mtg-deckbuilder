"use client";

import type { DeckEntry } from "@mtg/mtg";
import { toast } from "sonner";
import { groupEntries } from "@/lib/grouping";

const CARD_W = 146;
const CARD_H = 204;
const GAP = 8;
const HEADER = 64;
const COLS = 10;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Renders the deck as a PNG: card images (whole, uncropped, from Scryfall's CDN) grouped by type,
 * with quantities, plus a Scryfall credit line.
 */
export async function exportDeckImage(name: string, entries: DeckEntry[]): Promise<void> {
  const t = toast.loading("Rendering deck image…");
  try {
    const sections = [
      {
        label: "Commander",
        entries: entries.filter((e) => e.zone === "commander" || e.zone === "companion"),
      },
      ...groupEntries(
        entries.filter((e) => e.zone === "mainboard"),
        "type",
        "mv",
        "eur",
      ).map((g) => ({ label: `${g.label} (${g.count})`, entries: g.entries })),
    ].filter((s) => s.entries.length);
    let rows = 0;
    for (const s of sections) rows += Math.ceil(s.entries.length / COLS);
    const width = COLS * (CARD_W + GAP) + GAP;
    const height = HEADER + sections.length * 28 + rows * (CARD_H + GAP) + 40;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#16181f";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#eef0f5";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(name, GAP * 2, 42);
    const images = await Promise.all(
      entries.map((e) =>
        (e.printing?.imageUris?.normal ?? e.printing?.faceImageUris[0]?.normal)
          ? load(e.printing?.imageUris?.normal ?? e.printing!.faceImageUris[0]!.normal!)
          : Promise.resolve(null),
      ),
    );
    const imgOf = new Map(entries.map((e, i) => [e.id, images[i]]));
    let y = HEADER;
    for (const s of sections) {
      ctx.fillStyle = "#a9b0c3";
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.fillText(s.label, GAP * 2, y + 18);
      y += 28;
      s.entries.forEach((e, i) => {
        const x = GAP + (i % COLS) * (CARD_W + GAP);
        const yy = y + Math.floor(i / COLS) * (CARD_H + GAP);
        const img = imgOf.get(e.id);
        if (img) ctx.drawImage(img, x, yy, CARD_W, CARD_H);
        else {
          ctx.fillStyle = "#2a2e3a";
          ctx.fillRect(x, yy, CARD_W, CARD_H);
          ctx.fillStyle = "#eef0f5";
          ctx.font = "12px system-ui, sans-serif";
          ctx.fillText(e.card.name.slice(0, 22), x + 6, yy + 20);
        }
        if (e.qty > 1) {
          ctx.fillStyle = "rgba(0,0,0,0.8)";
          ctx.fillRect(x + 4, yy + 26, 34, 22);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 15px system-ui, sans-serif";
          ctx.fillText(`×${e.qty}`, x + 8, yy + 43);
        }
      });
      y += Math.ceil(s.entries.length / COLS) * (CARD_H + GAP);
    }
    ctx.fillStyle = "#7d8496";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Card images © Wizards of the Coast, via Scryfall (scryfall.com).", GAP * 2, height - 14);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("The browser blocked the image export (cross-origin images).");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w.-]+/g, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Deck image saved", { id: t });
  } catch (e) {
    toast.error((e as Error).message, { id: t });
  }
}
