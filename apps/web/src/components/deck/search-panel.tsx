"use client";

import { useDraggable } from "@dnd-kit/core";
import { type Card, ZONE_LABELS, ZONES, type Zone } from "@mtg/mtg";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HelpCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CardImage } from "@/components/card/card-image";
import { ManaCost } from "@/components/card/mana";
import { Button } from "@/components/ui/button";
import { Input, Popover, PopoverContent, PopoverTrigger, Select, Skeleton } from "@/components/ui/primitives";
import { api, type CardHit, type SearchResponse } from "@/lib/api";
import { hitPrinting, rememberCard } from "@/lib/use-deck";
import { cn, formatPrice } from "@/lib/utils";

const PAGE = 60;

export function useCardSearch(q: string) {
  return useInfiniteQuery({
    queryKey: ["search", q],
    queryFn: ({ pageParam }) =>
      api<SearchResponse>(`/api/cards/search?q=${encodeURIComponent(q)}&limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length * PAGE : undefined),
    enabled: q.trim().length > 0,
    staleTime: 60_000,
  });
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const SYNTAX_HELP: [string, string][] = [
  ["t:creature", "Type line contains"],
  ['o:"draw a card"', "Oracle text (reminder text ignored; fo: includes it)"],
  ["c:ug  c=r  c>=wb  c:m", "Colours (at least / exactly / multicolour)"],
  ["id:simic  id<=esper", "Colour identity fits within"],
  ["mv<=3  pow>=4  pow>tou", "Mana value, power, toughness"],
  ["r:mythic  r>=rare", "Rarity (any printing)"],
  ["s:cmr  a:avon  year>=2020", "Set, artist, year"],
  ["f:commander  banned:modern", "Legality"],
  ["is:commander  is:mdfc  is:gc", "Card properties (gc = Game Changer)"],
  ["usd<1  eur<=0.5", "Cheapest printing price"],
  ["otag:ramp  k:flying  m:{2}{G}", "Oracle tags, keywords, mana cost"],
  ["-t:land  (a or b)", "Negation and grouping"],
  ["order:usd dir:desc", "Sort: name, mv, usd, eur, edhrec, rarity, released…"],
];

export function SyntaxHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Search syntax help">
          <HelpCircle />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 text-sm">
        <p className="mb-2 font-medium">Scryfall syntax</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {SYNTAX_HELP.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-xs">{k}</dt>
              <dd className="text-xs text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function SearchResult({
  hit,
  onAdd,
  onOpen,
}: {
  hit: CardHit;
  onAdd: (c: Card) => void;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `search:${hit.card.id}`,
    data: { kind: "search", hit },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("group relative", isDragging && "opacity-40")}
      title="Drag into the deck, or click + to add"
    >
      <div
        className="block w-full"
        onClick={() => onOpen(hit.card.id)}
        onKeyDown={(e) => e.key === "Enter" && onOpen(hit.card.id)}
      >
        <CardImage image={hit.image} faceImages={hit.faceImages} name={hit.card.name} />
      </div>
      <Button
        size="icon-sm"
        variant="secondary"
        className="absolute top-[8%] right-1 opacity-90 shadow"
        aria-label={`Add ${hit.card.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onAdd(hit.card)}
      >
        <Plus />
      </Button>
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <ManaCost cost={hit.card.faces[0]?.manaCost ?? hit.card.manaCost} size={11} />
        <span>{formatPrice(hit.card.minEur, "eur")}</span>
      </div>
    </div>
  );
}

/** Card search drawer: Scryfall syntax, virtualised results, drag or click to add. */
export function SearchPanel({
  onAdd,
  onOpen,
  onClose,
  defaultQuery = "",
  identityHint,
}: {
  onAdd: (card: Card, zone: Zone) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  defaultQuery?: string;
  identityHint?: string;
}) {
  const [q, setQ] = useState(defaultQuery);
  const [zone, setZone] = useState<Zone>("mainboard");
  const [restrict, setRestrict] = useState(true);
  const effective = `${q}${restrict && identityHint && q.trim() ? ` id<=${identityHint}` : ""}`;
  const debounced = useDebounced(effective);
  const res = useCardSearch(debounced);
  const hits = res.data?.pages.flatMap((p) => p.hits) ?? [];
  const first = res.data?.pages[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const COLS = 3;
  const rows = Math.ceil(hits.length / COLS);
  const virt = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 210,
    overscan: 3,
  });

  useEffect(() => {
    for (const h of hits) rememberCard(h.card, hitPrinting(h));
  }, [hits]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = virt.getVirtualItems();
  const last = items[items.length - 1];
  useEffect(() => {
    if (last && last.index >= rows - 2 && res.hasNextPage && !res.isFetchingNextPage) res.fetchNextPage();
  }, [last, rows, res]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='e.g. t:creature o:"draw a card" mv<=3'
            className="pl-8 font-mono text-xs"
            aria-label="Card search"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && hits[0]) onAdd(hits[0].card, zone);
            }}
          />
        </div>
        <SyntaxHelp />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close search">
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-xs">
        <span className="text-muted-foreground">Add to</span>
        <Select
          aria-label="Target zone"
          value={zone}
          onValueChange={(v) => setZone(v as Zone)}
          options={ZONES.map((z) => ({ value: z, label: ZONE_LABELS[z] }))}
          className="h-7 text-xs"
        />
        {identityHint !== undefined && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />{" "}
            Commander identity
          </label>
        )}
        <span className="ml-auto text-muted-foreground" aria-live="polite">
          {first ? `${first.total} cards · ${first.tookMs} ms` : ""}
        </span>
      </div>
      {first?.errors.length ? (
        <p className="border-b px-2 py-1 text-xs text-warning">{first.errors.join(" ")}</p>
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {!q.trim() ? (
          <div className="space-y-2 p-2 text-sm text-muted-foreground">
            <p>Search with Scryfall syntax. Press Enter to add the first result.</p>
            <ul className="space-y-1 font-mono text-xs">
              {[
                "otag:ramp mv<=2",
                "t:instant o:counter",
                "is:commander id:simic",
                'o:"draw a card" usd<1',
              ].map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    className="hover:text-foreground hover:underline"
                    onClick={() => setQ(ex)}
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : res.isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="card-img" />
            ))}
          </div>
        ) : hits.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No cards found.</p>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {items.map((row) => (
              <div
                key={row.key}
                ref={virt.measureElement}
                data-index={row.index}
                className="absolute inset-x-0 grid grid-cols-3 gap-2 pb-2"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {hits.slice(row.index * COLS, row.index * COLS + COLS).map((h) => (
                  <SearchResult key={h.card.id} hit={h} onAdd={(c) => onAdd(c, zone)} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
