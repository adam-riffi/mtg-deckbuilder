"use client";

import { type DeckEntry, ZONE_LABELS, ZONES } from "@mtg/mtg";
import { ArrowRightLeft, Minus, Plus, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { useEditor } from "@/stores/editor-store";
import { moveOps, qtyOps, removeOps, useEditorActions } from "./entry-actions";

/** Actions for the current multi-selection. */
export function BulkBar({ entries, onCategories }: { entries: DeckEntry[]; onCategories: () => void }) {
  const a = useEditorActions();
  const clear = useEditor((s) => s.clearSelection);
  const n = entries.reduce((s, e) => s + e.qty, 0);
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover px-2 py-1.5 shadow-xl"
    >
      <span className="px-2 text-sm">
        {entries.length} selected ({n} cards)
      </span>
      <Button size="sm" variant="ghost" onClick={() => a.apply(qtyOps(entries, 1))}>
        <Plus /> 1
      </Button>
      <Button size="sm" variant="ghost" onClick={() => a.apply(qtyOps(entries, -1))}>
        <Minus /> 1
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <ArrowRightLeft /> Move
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {ZONES.map((z) => (
            <DropdownMenuItem key={z} onSelect={() => a.apply(moveOps(entries, z))}>
              {ZONE_LABELS[z]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" onClick={onCategories}>
        <Tags /> Categories
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          a.apply(removeOps(entries));
          clear();
        }}
      >
        <Trash2 /> Remove
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={clear} aria-label="Clear selection">
        <X />
      </Button>
    </div>
  );
}
