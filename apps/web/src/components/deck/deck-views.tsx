"use client";

import { useDroppable } from "@dnd-kit/core";
import { type DeckEntry, entryPrice, ZONE_LABELS, type Zone } from "@mtg/mtg";
import { Minus, Plus } from "lucide-react";
import { ManaCost } from "@/components/card/mana";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/primitives";
import { type Group, groupEntries, sortEntries } from "@/lib/grouping";
import { cn, formatPrice } from "@/lib/utils";
import { type GroupBy, useEditor } from "@/stores/editor-store";
import { CardHoverPreview } from "./card-preview";
import { DeckCard, type Ghost, useEntrySelection, useMenuEntries } from "./deck-card";
import { EntryContextMenu, qtyOps, useEditorActions } from "./entry-actions";
import { TableView } from "./table-view";

export interface ViewProps {
  entries: DeckEntry[];
  ghostAdds: DeckEntry[];
  ghostRemoves: Set<string>;
  categoryOrder: string[];
}

const ZONE_ORDER: Zone[] = ["commander", "companion", "mainboard", "sideboard", "maybeboard"];

export function DeckViews(props: ViewProps) {
  const view = useEditor((s) => s.view);
  if (view === "table") return <TableView {...props} />;
  const all = props.entries;
  const zones = ZONE_ORDER.map((z) => ({
    zone: z,
    entries: all.filter((e) => e.zone === z),
    ghosts: props.ghostAdds.filter((e) => e.zone === z),
  })).filter(
    (z) =>
      z.entries.length ||
      z.ghosts.length ||
      z.zone === "mainboard" ||
      z.zone === "commander" ||
      z.zone === "sideboard",
  );
  return (
    <div className="flex flex-col gap-6">
      {zones.map((z) => (
        <ZoneSection key={z.zone} zone={z.zone} entries={z.entries} ghosts={z.ghosts} props={props} />
      ))}
    </div>
  );
}

function ZoneSection({
  zone,
  entries,
  ghosts,
  props,
}: {
  zone: Zone;
  entries: DeckEntry[];
  ghosts: DeckEntry[];
  props: ViewProps;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone}`, data: { zone } });
  const view = useEditor((s) => s.view);
  const groupBy = useEditor((s) => s.groupBy);
  const sortBy = useEditor((s) => s.sortBy);
  const currency = useEditor((s) => s.currency);
  const count = entries.reduce((n, e) => n + e.qty, 0);
  const grouped = zone === "mainboard" || zone === "sideboard" || zone === "maybeboard";
  const groups: Group[] = grouped
    ? groupEntries([...entries, ...ghosts], groupBy, sortBy, currency, props.categoryOrder)
    : [
        {
          key: zone,
          label: ZONE_LABELS[zone],
          entries: sortEntries([...entries, ...ghosts], sortBy, currency),
          count,
        },
      ];
  const ghostIds = new Set(ghosts.map((g) => g.id));
  const ghostOf = (e: DeckEntry): Ghost =>
    ghostIds.has(e.id) ? "add" : props.ghostRemoves.has(e.id) ? "remove" : null;

  return (
    <section
      ref={setNodeRef}
      aria-label={ZONE_LABELS[zone]}
      className={cn(
        "rounded-lg border border-transparent p-1 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <h2 className="mb-2 flex items-baseline gap-2 border-b pb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {ZONE_LABELS[zone]} <span className="font-normal">{count}</span>
      </h2>
      {entries.length + ghosts.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {zone === "commander"
            ? "Drag a legendary creature here, or right-click a card → Move to → Commander."
            : "Drop cards here."}
        </p>
      ) : view === "stacks" ? (
        <div className="flex flex-wrap items-start gap-4">
          {groups.map((g) => (
            <GroupBox
              key={g.key}
              zone={zone}
              group={g}
              groupBy={grouped ? groupBy : "none"}
              className="w-[10.5rem]"
            >
              <div className="flex flex-col">
                {g.entries.map((e, i) => (
                  <div key={e.id} className={cn(i > 0 && "-mt-[118%]")} style={{ zIndex: i }}>
                    <DeckCard entry={e} all={props.entries} ghost={ghostOf(e)} stacked />
                  </div>
                ))}
              </div>
            </GroupBox>
          ))}
        </div>
      ) : view === "grid" ? (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <GroupBox key={g.key} zone={zone} group={g} groupBy={grouped ? groupBy : "none"}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
                {g.entries.map((e) => (
                  <DeckCard key={e.id} entry={e} all={props.entries} ghost={ghostOf(e)} />
                ))}
              </div>
            </GroupBox>
          ))}
        </div>
      ) : (
        <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
          {groups.map((g) => (
            <GroupBox
              key={g.key}
              zone={zone}
              group={g}
              groupBy={grouped ? groupBy : "none"}
              className="mb-4 break-inside-avoid"
            >
              <ul>
                {g.entries.map((e) => (
                  <TextRow key={e.id} entry={e} all={props.entries} ghost={ghostOf(e)} currency={currency} />
                ))}
              </ul>
            </GroupBox>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupBox({
  zone,
  group,
  groupBy,
  className,
  children,
}: {
  zone: Zone;
  group: Group;
  groupBy: GroupBy;
  className?: string;
  children: React.ReactNode;
}) {
  const droppable = groupBy === "category" && group.key !== "Uncategorized";
  const { setNodeRef, isOver } = useDroppable({
    id: `group:${zone}:${group.key}`,
    data: { zone, category: droppable ? group.key : null },
    disabled: !droppable,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-md", isOver && droppable && "bg-primary/10 ring-1 ring-primary", className)}
    >
      {groupBy !== "none" && (
        <h3 className="mb-1 flex items-baseline justify-between px-0.5 text-sm font-medium">
          <span className="truncate">{group.label}</span>
          <span className="text-xs text-muted-foreground">{group.count}</span>
        </h3>
      )}
      {children}
    </div>
  );
}

function TextRow({
  entry,
  all,
  ghost,
  currency,
}: {
  entry: DeckEntry;
  all: DeckEntry[];
  ghost: Ghost;
  currency: "eur" | "usd";
}) {
  const actions = useEditorActions();
  const { selected, onClick } = useEntrySelection(entry);
  const menuEntries = useMenuEntries(entry, all);
  const row = (
    <li
      className={cn(
        "group flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent",
        selected && "bg-primary/15",
        ghost === "add" && "ghost-add",
        ghost === "remove" && "ghost-remove line-through",
      )}
    >
      <span className="w-6 text-right tabular-nums text-muted-foreground">{entry.qty}</span>
      {!ghost && (actions.missing?.(entry.id) ?? 0) > 0 && (
        <span
          className="rounded bg-warning/20 px-1 text-[10px] text-warning"
          title="Missing from your collection"
        >
          need {actions.missing?.(entry.id)}
        </span>
      )}
      <CardHoverPreview card={entry.card} printing={entry.printing}>
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate text-left hover:underline"
          aria-pressed={selected}
        >
          {entry.card.name}
          {ghost === "add" && <span className="ml-1 text-xs text-success">(AI add)</span>}
        </button>
      </CardHoverPreview>
      <ManaCost cost={entry.card.faces[0]?.manaCost ?? entry.card.manaCost} size={13} />
      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
        {formatPrice(entryPrice(entry, currency), currency)}
      </span>
      {!ghost && !actions.readOnly && (
        <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Remove one ${entry.card.name}`}
            onClick={() => actions.apply(qtyOps([entry], -1))}
            className="rounded p-0.5 hover:bg-background"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Add one ${entry.card.name}`}
            onClick={() => actions.apply(qtyOps([entry], 1))}
            className="rounded p-0.5 hover:bg-background"
          >
            <Plus className="size-3.5" />
          </button>
        </span>
      )}
    </li>
  );
  if (ghost || actions.readOnly) return row;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <EntryContextMenu entries={menuEntries} />
    </ContextMenu>
  );
}
