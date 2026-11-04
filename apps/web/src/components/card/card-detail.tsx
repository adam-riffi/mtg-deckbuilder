"use client";

import { FORMATS, type Printing, priceIn } from "@mtg/mtg";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CardImage } from "@/components/card/card-image";
import { ManaCost, OracleText } from "@/components/card/mana";
import { PriceHistory } from "@/components/card/price-history";
import {
  Badge,
  Dialog,
  DialogContent,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/primitives";
import { api, type CardDetail as Detail } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";

const LEGALITY_STYLE: Record<string, string> = {
  legal: "bg-success/15 text-success",
  restricted: "bg-warning/15 text-warning",
  banned: "bg-destructive/15 text-destructive",
  not_legal: "bg-muted text-muted-foreground",
};

export function useCardDetail(id: string | null) {
  return useQuery({
    queryKey: ["card", id],
    queryFn: () => api<Detail>(`/api/cards/${id}`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

/** Full card view: oracle text per face, legalities, printings and prices, rulings, related tokens. */
export function CardDetailView({
  id,
  onPickPrinting,
  currentPrintingId,
}: {
  id: string;
  onPickPrinting?: (p: Printing) => void;
  currentPrintingId?: string | null;
}) {
  const { data, isLoading } = useCardDetail(id);
  const [printingId, setPrintingId] = useState<string | null>(currentPrintingId ?? null);
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  const { card, printings, rulings, tokens, tags } = data;
  const shown = printings.find((p) => p.id === printingId) ?? printings[0];
  const faces = card.faces.length
    ? card.faces
    : [
        {
          name: card.name,
          manaCost: card.manaCost,
          typeLine: card.typeLine,
          oracleText: card.oracleText,
          power: card.power,
          toughness: card.toughness,
          loyalty: card.loyalty,
          defense: card.defense,
          colors: card.colors,
        },
      ];
  return (
    <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
      <div className="space-y-2">
        <CardImage
          image={shown?.imageUris}
          faceImages={shown?.faceImageUris}
          name={card.name}
          size="large"
          lazy={false}
        />
        {shown && (
          <p className="text-xs text-muted-foreground">
            {shown.setName} ({shown.setCode.toUpperCase()}) #{shown.collectorNumber} · {shown.rarity} · Illus.{" "}
            {shown.artist ?? "—"}
          </p>
        )}
        {shown?.scryfallUri && (
          <a
            href={shown.scryfallUri}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View on Scryfall <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <Tabs defaultValue="text" className="min-w-0">
        <TabsList>
          <TabsTrigger value="text">Card</TabsTrigger>
          <TabsTrigger value="printings">Printings ({printings.length})</TabsTrigger>
          <TabsTrigger value="rulings">Rulings ({rulings.length})</TabsTrigger>
          <TabsTrigger value="prices">Prices</TabsTrigger>
        </TabsList>
        <TabsContent value="text" className="mt-3 space-y-4">
          {faces.map((f) => (
            <div key={f.name} className="space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{f.name}</h3>
                <ManaCost cost={f.manaCost} />
              </div>
              <p className="text-sm text-muted-foreground">{f.typeLine}</p>
              <OracleText text={f.oracleText} />
              {(f.power || f.loyalty || f.defense) && (
                <p className="text-right text-sm font-semibold">
                  {f.power
                    ? `${f.power}/${f.toughness}`
                    : f.loyalty
                      ? `Loyalty ${f.loyalty}`
                      : `Defense ${f.defense}`}
                </p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {card.gameChanger && <Badge variant="warning">Game Changer</Badge>}
            {card.reserved && <Badge variant="muted">Reserved List</Badge>}
            {tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
          <div>
            <h4 className="mb-1 text-sm font-medium">Legalities</h4>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {FORMATS.filter((f) => f.legalityKey).map((f) => {
                const l = card.legalities[f.legalityKey] ?? "not_legal";
                return (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>{f.name}</span>
                    <span className={cn("rounded px-1.5 py-0.5", LEGALITY_STYLE[l])}>
                      {l.replace("_", " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {tokens.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-medium">Related cards and tokens</h4>
              <ul className="space-y-0.5 text-sm">
                {tokens.map((t) => (
                  <li key={t.id}>
                    {t.name} <span className="text-xs text-muted-foreground">— {t.typeLine}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={`/cards/${card.id}`} className="text-xs text-primary hover:underline">
            Open card page
          </Link>
        </TabsContent>
        <TabsContent value="printings" className="mt-3">
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border text-sm">
            {printings.map((p) => (
              <li
                key={p.id}
                className={cn("flex items-center gap-2 px-2 py-1.5", p.id === shown?.id && "bg-accent")}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onMouseEnter={() => setPrintingId(p.id)}
                  onFocus={() => setPrintingId(p.id)}
                  onClick={() => setPrintingId(p.id)}
                >
                  <span className="font-mono text-xs uppercase">{p.setCode}</span> {p.setName}{" "}
                  <span className="text-xs text-muted-foreground">
                    #{p.collectorNumber} · {p.releasedAt.slice(0, 4)} · {p.finishes.join("/")}
                  </span>
                </button>
                <span className="w-16 text-right text-xs tabular-nums">
                  {formatPrice(priceIn(p.prices, "eur"), "eur")}
                </span>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {formatPrice(priceIn(p.prices, "usd"), "usd")}
                </span>
                {onPickPrinting && (
                  <button
                    type="button"
                    className="rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
                    onClick={() => onPickPrinting(p)}
                  >
                    {p.id === currentPrintingId ? "Current" : "Use"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="rulings" className="mt-3">
          {rulings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rulings.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
              {rulings.map((r, i) => (
                <li key={i} className="rounded-md border p-2">
                  <p>{r.comment}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.publishedAt} · {r.source}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="prices" className="mt-3">
          <PriceHistory printingId={shown?.id ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function CardDetailDialog({
  id,
  onClose,
  onPickPrinting,
  currentPrintingId,
}: {
  id: string | null;
  onClose: () => void;
  onPickPrinting?: (p: Printing) => void;
  currentPrintingId?: string | null;
}) {
  const { data } = useCardDetail(id);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={data?.card.name ?? "Card"} className="w-[min(96vw,56rem)]">
        {id && (
          <CardDetailView id={id} onPickPrinting={onPickPrinting} currentPrintingId={currentPrintingId} />
        )}
      </DialogContent>
    </Dialog>
  );
}
