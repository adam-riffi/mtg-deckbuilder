"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CardDetailDialog } from "@/components/card/card-detail";
import { CardImage } from "@/components/card/card-image";
import { SyntaxHelp, useCardSearch, useDebounced } from "@/components/deck/search-panel";
import { Input, Skeleton } from "@/components/ui/primitives";
import { formatPrice } from "@/lib/utils";

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const debounced = useDebounced(q, 300);
  const res = useCardSearch(debounced);
  const hits = res.data?.pages.flatMap((p) => p.hits) ?? [];
  const first = res.data?.pages[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(6);

  useEffect(() => {
    router.replace(debounced ? `/search?q=${encodeURIComponent(debounced)}` : "/search", { scroll: false });
  }, [debounced, router]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCols(Math.max(2, Math.floor(el.clientWidth / 190))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = Math.ceil(hits.length / cols);
  const virt = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 290,
    overscan: 2,
  });
  const items = virt.getVirtualItems();
  const last = items[items.length - 1];
  useEffect(() => {
    if (last && last.index >= rows - 2 && res.hasNextPage && !res.isFetchingNextPage) res.fetchNextPage();
  }, [last, rows, res]);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-3xl flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Scryfall syntax, e.g. t:legendary t:creature id:golgari f:commander order:edhrec"
            className="pl-8 font-mono text-sm"
            aria-label="Search cards"
          />
        </div>
        <SyntaxHelp />
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {first ? `${first.total.toLocaleString()} cards · ${first.tookMs} ms` : ""}
        </span>
      </div>
      {first?.errors.length ? (
        <p className="px-3 py-1 text-xs text-warning">{first.errors.join(" ")}</p>
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {!q.trim() ? (
          <p className="p-6 text-center text-muted-foreground">
            Search the card database with Scryfall syntax. Results are virtualised, so broad queries stay
            fast.
          </p>
        ) : res.isLoading ? (
          <div className="grid grid-cols-6 gap-3">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="card-img" />
            ))}
          </div>
        ) : hits.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No cards found.</p>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {items.map((row) => (
              <div
                key={row.key}
                ref={virt.measureElement}
                data-index={row.index}
                className="absolute inset-x-0 grid gap-3 pb-3"
                style={{
                  transform: `translateY(${row.start}px)`,
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {hits.slice(row.index * cols, row.index * cols + cols).map((h) => (
                  // biome-ignore lint/a11y/useSemanticElements: contains the card's own flip button, so it cannot be a <button>
                  <div
                    key={h.card.id}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer text-left"
                    onClick={() => setOpen(h.card.id)}
                    onKeyDown={(e) => e.key === "Enter" && setOpen(h.card.id)}
                    aria-label={h.card.name}
                  >
                    <CardImage image={h.image} faceImages={h.faceImages} name={h.card.name} />
                    <span className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span className="truncate">{h.card.name}</span>
                      <span>{formatPrice(h.card.minEur, "eur")}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <CardDetailDialog id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export function CardSearchPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
