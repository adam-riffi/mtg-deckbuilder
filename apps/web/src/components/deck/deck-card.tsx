"use client";

import { useDraggable } from "@dnd-kit/core";
import type { DeckEntry } from "@mtg/mtg";
import { Minus, Plus } from "lucide-react";
import { CardImage } from "@/components/card/card-image";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { EntryContextMenu, qtyOps, useEditorActions } from "./entry-actions";

export type Ghost = "add" | "remove" | null;

/** Selection helper shared by all views: click opens details, Ctrl/Cmd/Shift-click toggles selection. */
export function useEntrySelection(entry: DeckEntry) {
  const selected = useEditor((s) => s.selection.includes(entry.id));
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const actions = useEditorActions();
  const onClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      select(entry.id, "toggle");
    } else actions.openDetail(entry.cardId);
  };
  return { selected, selection, onClick };
}

/** Entries the context menu should act on: the whole selection if this card is part of it. */
export function useMenuEntries(entry: DeckEntry, all: DeckEntry[]): DeckEntry[] {
  const selection = useEditor((s) => s.selection);
  return selection.includes(entry.id) && selection.length > 1
    ? all.filter((e) => selection.includes(e.id))
    : [entry];
}

export function DeckCard({
  entry,
  all,
  ghost = null,
  stacked = false,
  className,
}: {
  entry: DeckEntry;
  all: DeckEntry[];
  ghost?: Ghost;
  stacked?: boolean;
  className?: string;
}) {
  const actions = useEditorActions();
  const { selected, onClick } = useEntrySelection(entry);
  const menuEntries = useMenuEntries(entry, all);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry:${entry.id}`,
    data: { kind: "entry", entry },
    disabled: ghost !== null || actions.readOnly,
  });
  const img = entry.printing?.imageUris ?? null;
  const faces = entry.printing?.faceImageUris ?? [];
  const body = (
    // biome-ignore lint/a11y/useSemanticElements: draggable card needs a div (dnd-kit) and contains its own controls
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={ghost ? undefined : onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") actions.openDetail(entry.cardId);
        if (e.key === " ") {
          e.preventDefault();
          useEditor.getState().select(entry.id, "toggle");
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${entry.qty}× ${entry.card.name}${selected ? " (selected)" : ""}`}
      aria-pressed={selected}
      className={cn(
        "group relative w-full rounded-[4.75%/3.5%] outline-none transition-transform",
        stacked && "hover:z-10 hover:-translate-y-1 focus-visible:z-10",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDragging && "opacity-40",
        ghost === "add" && "ghost-add",
        ghost === "remove" && "ghost-remove",
        className,
      )}
    >
      <CardImage image={img} faceImages={faces} name={entry.card.name} />
      {entry.qty > 1 && (
        <span className="absolute top-[8%] left-1 rounded bg-black/80 px-1.5 text-xs font-bold text-white">
          ×{entry.qty}
        </span>
      )}
      {!ghost && (actions.missing?.(entry.id) ?? 0) > 0 && (
        <span
          className="absolute bottom-[22%] left-1 rounded bg-warning px-1 text-[10px] font-bold text-black"
          title="Missing from your collection"
        >
          NEED {actions.missing?.(entry.id)}
        </span>
      )}
      {entry.finish !== "nonfoil" && (
        <span className="absolute top-[8%] right-1 rounded bg-gradient-to-r from-pink-500 to-yellow-400 px-1 text-[10px] font-bold text-black">
          {entry.finish === "foil" ? "FOIL" : "ETCHED"}
        </span>
      )}
      {ghost && (
        <span
          className={cn(
            "absolute bottom-2 left-1/2 -translate-x-1/2 rounded px-1.5 text-[10px] font-bold",
            ghost === "add" ? "bg-success text-black" : "bg-destructive text-white",
          )}
        >
          {ghost === "add" ? "AI: ADD" : "AI: REMOVE"}
        </span>
      )}
      {!ghost && !actions.readOnly && (
        <div className="absolute right-1 bottom-[6%] hidden gap-1 group-hover:flex group-focus-within:flex">
          <button
            type="button"
            aria-label={`Remove one ${entry.card.name}`}
            className="rounded bg-black/80 p-0.5 text-white hover:bg-black"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              actions.apply(qtyOps([entry], -1));
            }}
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Add one ${entry.card.name}`}
            className="rounded bg-black/80 p-0.5 text-white hover:bg-black"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              actions.apply(qtyOps([entry], 1));
            }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
  if (ghost || actions.readOnly) return body;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <EntryContextMenu entries={menuEntries} />
    </ContextMenu>
  );
}
