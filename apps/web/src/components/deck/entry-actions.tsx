"use client";

import { type DeckEntry, type DeckOp, ZONE_LABELS, ZONES, type Zone } from "@mtg/mtg";
import { ArrowRightLeft, Info, Layers, Minus, Plus, Tags, Trash2 } from "lucide-react";
import { createContext, useContext } from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/primitives";

/** Editor-wide actions, provided by DeckEditor so every view can use them. */
export interface EditorActions {
  apply: (ops: DeckOp[], summary?: string) => void;
  openDetail: (cardId: string) => void;
  editCategories: (entries: DeckEntry[]) => void;
  pickPrinting: (entry: DeckEntry) => void;
  categories: string[];
  readOnly?: boolean;
}

export const EditorActionsContext = createContext<EditorActions | null>(null);
export function useEditorActions(): EditorActions {
  const ctx = useContext(EditorActionsContext);
  if (!ctx) throw new Error("EditorActionsContext missing");
  return ctx;
}

export function qtyOps(entries: DeckEntry[], delta: number): DeckOp[] {
  return entries.map((e) =>
    delta > 0
      ? { op: "add", oracleId: e.cardId, qty: delta, zone: e.zone }
      : { op: "remove", oracleId: e.cardId, zone: e.zone, qty: -delta },
  );
}

export function moveOps(entries: DeckEntry[], to: Zone): DeckOp[] {
  return entries
    .filter((e) => e.zone !== to)
    .map((e) => ({ op: "move", oracleId: e.cardId, from: e.zone, to }));
}

export function removeOps(entries: DeckEntry[]): DeckOp[] {
  return entries.map((e) => ({ op: "remove", oracleId: e.cardId, zone: e.zone }));
}

/** Right-click menu for one or more selected entries. */
export function EntryContextMenu({ entries }: { entries: DeckEntry[] }) {
  const a = useEditorActions();
  const one = entries.length === 1 ? entries[0]! : null;
  return (
    <ContextMenuContent>
      {one && (
        <ContextMenuItem onSelect={() => a.openDetail(one.cardId)}>
          <Info /> Card details
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => a.apply(qtyOps(entries, 1))}>
        <Plus /> Add one {entries.length > 1 ? `(each of ${entries.length})` : ""}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => a.apply(qtyOps(entries, -1))}>
        <Minus /> Remove one
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <ArrowRightLeft /> Move to
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {ZONES.map((z) => (
            <ContextMenuItem
              key={z}
              onSelect={() => a.apply(moveOps(entries, z))}
              disabled={entries.every((e) => e.zone === z)}
            >
              {ZONE_LABELS[z]}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => a.editCategories(entries)}>
        <Tags /> Categories &amp; tags…
      </ContextMenuItem>
      {one && (
        <ContextMenuItem onSelect={() => a.pickPrinting(one)}>
          <Layers /> Change printing…
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem className="text-destructive" onSelect={() => a.apply(removeOps(entries))}>
        <Trash2 /> Remove from deck
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
