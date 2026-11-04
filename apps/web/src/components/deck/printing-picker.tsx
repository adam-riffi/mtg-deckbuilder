"use client";

import { type DeckEntry, type DeckOp, type Finish, priceIn } from "@mtg/mtg";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CardImage } from "@/components/card/card-image";
import { Dialog, DialogContent, Input, Select, Skeleton } from "@/components/ui/primitives";
import { api, type CardDetail } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";

/** Choose set, art and finish for a deck entry. */
export function PrintingPicker({
  entry,
  onClose,
  apply,
  currency,
}: {
  entry: DeckEntry | null;
  onClose: () => void;
  apply: (ops: DeckOp[]) => void;
  currency: "eur" | "usd";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["card", entry?.cardId],
    queryFn: () => api<CardDetail>(`/api/cards/${entry!.cardId}`),
    enabled: !!entry,
  });
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"date" | "price">("date");
  const printings = useMemo(() => {
    const list = (data?.printings ?? []).filter(
      (p) =>
        !filter || `${p.setName} ${p.setCode} ${p.artist ?? ""}`.toLowerCase().includes(filter.toLowerCase()),
    );
    if (sort === "price")
      return [...list].sort(
        (a, b) => (priceIn(a.prices, currency) ?? 9e9) - (priceIn(b.prices, currency) ?? 9e9),
      );
    return list;
  }, [data, filter, sort, currency]);
  if (!entry) return null;
  const choose = (printingId: string, finish: Finish) => {
    apply([{ op: "set_printing", oracleId: entry.cardId, zone: entry.zone, printingId, finish }]);
    onClose();
  };
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Printing — ${entry.card.name}`}
        description="Pick a set, art and finish."
        className="w-[min(96vw,64rem)]"
      >
        <div className="flex gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by set or artist"
            aria-label="Filter printings"
          />
          <Select
            aria-label="Sort printings"
            value={sort}
            onValueChange={(v) => setSort(v as "date")}
            options={[
              { value: "date", label: "Newest" },
              { value: "price", label: "Cheapest" },
            ]}
            className="w-32"
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <ul className="grid max-h-[65vh] grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3 overflow-y-auto">
            {printings.map((p) => (
              <li
                key={p.id}
                className={cn("space-y-1 rounded-md p-1", entry.printingId === p.id && "ring-2 ring-primary")}
              >
                <CardImage
                  image={p.imageUris}
                  faceImages={p.faceImageUris}
                  name={`${p.name} (${p.setCode})`}
                  size="small"
                />
                <p className="truncate text-xs">
                  <span className="font-mono uppercase">{p.setCode}</span> #{p.collectorNumber} ·{" "}
                  {p.releasedAt.slice(0, 4)}
                </p>
                <div className="flex flex-wrap gap-1">
                  {p.finishes.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => choose(p.id, f)}
                      className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                    >
                      {f} {formatPrice(priceIn(p.prices, currency, f), currency)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
