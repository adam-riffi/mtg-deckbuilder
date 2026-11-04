"use client";

import { type DeckEntry, entryPrice, primaryType, ZONE_LABELS } from "@mtg/mtg";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { ManaCost } from "@/components/card/mana";
import { Checkbox, ContextMenu, ContextMenuTrigger } from "@/components/ui/primitives";
import { cn, formatPrice } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { CardHoverPreview } from "./card-preview";
import { useMenuEntries } from "./deck-card";
import type { ViewProps } from "./deck-views";
import { EntryContextMenu, useEditorActions } from "./entry-actions";

export function TableView({ entries, ghostAdds, ghostRemoves }: ViewProps) {
  const currency = useEditor((s) => s.currency);
  const selection = useEditor((s) => s.selection);
  const setSelection = useEditor((s) => s.setSelection);
  const actions = useEditorActions();
  const [sorting, setSorting] = useState<SortingState>([{ id: "zone", desc: false }]);
  const ghostIds = useMemo(() => new Set(ghostAdds.map((g) => g.id)), [ghostAdds]);
  const data = useMemo(() => [...entries, ...ghostAdds], [entries, ghostAdds]);

  const columns = useMemo<ColumnDef<DeckEntry>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            aria-label="Select all"
            checked={selection.length > 0 && selection.length === entries.length}
            onCheckedChange={(v) => setSelection(v ? entries.map((e) => e.id) : [])}
          />
        ),
        cell: ({ row }) =>
          ghostIds.has(row.original.id) ? null : (
            <Checkbox
              aria-label={`Select ${row.original.card.name}`}
              checked={selection.includes(row.original.id)}
              onCheckedChange={() => useEditor.getState().select(row.original.id, "toggle")}
            />
          ),
        enableSorting: false,
      },
      {
        id: "qty",
        header: "Qty",
        accessorFn: (e) => e.qty,
        cell: ({ row }) =>
          ghostIds.has(row.original.id) || actions.readOnly ? (
            row.original.qty
          ) : (
            <input
              type="number"
              min={0}
              max={999}
              aria-label={`Quantity of ${row.original.card.name}`}
              defaultValue={row.original.qty}
              key={row.original.qty}
              onBlur={(ev) => {
                const v = Number(ev.currentTarget.value);
                if (Number.isInteger(v) && v !== row.original.qty)
                  actions.apply([
                    { op: "set_qty", oracleId: row.original.cardId, zone: row.original.zone, qty: v },
                  ]);
              }}
              onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
              className="w-12 rounded border bg-transparent px-1 text-right"
            />
          ),
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (e) => e.card.name,
        cell: ({ row }) => (
          <CardHoverPreview card={row.original.card} printing={row.original.printing}>
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => actions.openDetail(row.original.cardId)}
            >
              {row.original.card.name}
              {ghostIds.has(row.original.id) && <span className="ml-1 text-xs text-success">(AI add)</span>}
            </button>
          </CardHoverPreview>
        ),
      },
      {
        id: "mana",
        header: "Cost",
        accessorFn: (e) => e.card.cmc,
        cell: ({ row }) => (
          <ManaCost cost={row.original.card.faces[0]?.manaCost ?? row.original.card.manaCost} size={13} />
        ),
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (e) => primaryType(e.card.typeLine),
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.card.typeLine}</span>,
      },
      { id: "categories", header: "Categories", accessorFn: (e) => e.categories.join(", ") },
      {
        id: "zone",
        header: "Zone",
        accessorFn: (e) => ["commander", "companion", "mainboard", "sideboard", "maybeboard"].indexOf(e.zone),
        cell: ({ row }) => ZONE_LABELS[row.original.zone],
      },
      {
        id: "printing",
        header: "Printing",
        accessorFn: (e) => e.printing?.setCode ?? "",
        cell: ({ row }) => (
          <button
            type="button"
            className="uppercase hover:underline"
            onClick={() => actions.pickPrinting(row.original)}
            disabled={actions.readOnly}
          >
            {row.original.printing
              ? `${row.original.printing.setCode} ${row.original.printing.collectorNumber}`
              : "—"}
            {row.original.finish !== "nonfoil" && (
              <span className="ml-1 text-xs normal-case text-warning">{row.original.finish}</span>
            )}
          </button>
        ),
      },
      { id: "rarity", header: "Rarity", accessorFn: (e) => e.printing?.rarity ?? "" },
      {
        id: "price",
        header: `Price (${currency.toUpperCase()})`,
        accessorFn: (e) => entryPrice(e, currency) ?? -1,
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {formatPrice((getValue() as number) < 0 ? null : (getValue() as number), currency)}
          </span>
        ),
      },
    ],
    [selection, entries, ghostIds, currency, actions, setSelection],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.id,
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-2 py-1.5 text-left font-medium"
                  aria-sort={
                    h.column.getIsSorted() === "asc"
                      ? "ascending"
                      : h.column.getIsSorted() === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  {h.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={h.column.getToggleSortingHandler()}
                      className="flex items-center gap-1"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : h.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="size-3" />
                      ) : null}
                    </button>
                  ) : (
                    flexRender(h.column.columnDef.header, h.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <Row
              key={r.id}
              entry={r.original}
              all={entries}
              ghost={ghostIds.has(r.original.id) ? "add" : ghostRemoves.has(r.original.id) ? "remove" : null}
            >
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-2 py-1">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  entry,
  all,
  ghost,
  children,
}: {
  entry: DeckEntry;
  all: DeckEntry[];
  ghost: "add" | "remove" | null;
  children: React.ReactNode;
}) {
  const selected = useEditor((s) => s.selection.includes(entry.id));
  const menuEntries = useMenuEntries(entry, all);
  const actions = useEditorActions();
  const tr = (
    <tr
      className={cn(
        "border-t hover:bg-accent/50",
        selected && "bg-primary/10",
        ghost === "add" && "bg-success/10",
        ghost === "remove" && "bg-destructive/10 line-through opacity-70",
      )}
    >
      {children}
    </tr>
  );
  if (ghost || actions.readOnly) return tr;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{tr}</ContextMenuTrigger>
      <EntryContextMenu entries={menuEntries} />
    </ContextMenu>
  );
}
