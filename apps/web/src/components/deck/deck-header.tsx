"use client";

import {
  type BracketEstimate,
  colorIdentityLabel,
  countCards,
  type DeckEntry,
  deckColorIdentity,
  FORMATS,
  getFormat,
  type LegalityReport,
} from "@mtg/mtg";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { ColorPips } from "@/components/card/mana";
import { Badge, Input, Popover, PopoverContent, PopoverTrigger, Select } from "@/components/ui/primitives";
import { cn, formatPrice } from "@/lib/utils";

export function DeckHeader({
  name,
  format,
  entries,
  legality,
  bracket,
  targetBracket,
  price,
  currency,
  onRename,
  onFormat,
  onTargetBracket,
  readOnly,
}: {
  name: string;
  format: string;
  entries: DeckEntry[];
  legality: LegalityReport;
  bracket: BracketEstimate | null;
  targetBracket: number | null;
  price: number;
  currency: "eur" | "usd";
  onRename: (n: string) => void;
  onFormat: (f: string) => void;
  onTargetBracket: (b: number | null) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const f = getFormat(format);
  const commander = entries.find((e) => e.zone === "commander");
  const art = commander?.printing?.imageUris?.art_crop ?? commander?.printing?.faceImageUris[0]?.art_crop;
  const identity = deckColorIdentity(entries);
  const size = countCards(entries);
  const errors = legality.issues.filter((i) => i.severity === "error");
  const commanders = entries.filter((e) => e.zone === "commander").map((e) => e.card.name);

  return (
    <header className="relative overflow-hidden border-b">
      {art && (
        // biome-ignore lint/performance/noImgElement: Scryfall art crop shown as provided
        <img
          src={art}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[1px]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          {editing && !readOnly ? (
            <Input
              autoFocus
              defaultValue={name}
              aria-label="Deck name"
              className="h-8 text-lg font-semibold"
              onBlur={(e) => {
                setEditing(false);
                if (e.currentTarget.value.trim() && e.currentTarget.value !== name)
                  onRename(e.currentTarget.value.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <h1 className="truncate text-lg font-semibold">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="hover:underline"
                title="Rename"
              >
                {name}
              </button>
            </h1>
          )}
          <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <ColorPips colors={identity} /> {commanders.join(" & ") || colorIdentityLabel(identity)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            aria-label="Format"
            value={format}
            onValueChange={onFormat}
            options={FORMATS.map((x) => ({ value: x.id, label: x.name }))}
            className="h-8 w-40 bg-background/60"
          />
          <Badge variant="muted" className="h-7 px-2 text-sm" aria-label="Card count">
            {size}
            {f.exactSize ? ` / ${f.exactSize}` : f.minMain ? ` / ${f.minMain}+` : ""} cards
          </Badge>
          <Badge variant="muted" className="h-7 px-2 text-sm" aria-label="Deck price">
            {formatPrice(price, currency)}
          </Badge>
          {f.commander && bracket && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-7 rounded-md bg-primary/15 px-2 text-sm font-medium text-primary"
                  aria-label="Bracket details"
                >
                  Bracket {bracket.bracket} · {bracket.name}
                  {targetBracket && targetBracket !== bracket.bracket ? ` (target ${targetBracket})` : ""}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96 space-y-2 text-sm">
                <p className="font-medium">
                  Estimated bracket {bracket.bracket} — {bracket.name}
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {bracket.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-xs">
                  <span>Target bracket</span>
                  <Select
                    aria-label="Target bracket"
                    value={String(targetBracket ?? "none")}
                    onValueChange={(v) => onTargetBracket(v === "none" ? null : Number(v))}
                    options={[
                      { value: "none", label: "None" },
                      ...[1, 2, 3, 4, 5].map((b) => ({ value: String(b), label: String(b) })),
                    ]}
                    className="h-7"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Rules version {bracket.configVersion}. Brackets are in beta; edit the bracket config in
                  Settings when they change.
                </p>
              </PopoverContent>
            </Popover>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Legality details"
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium",
                  legality.legal ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                )}
              >
                {legality.legal ? <CheckCircle2 className="size-4" /> : <ShieldAlert className="size-4" />}
                {legality.legal ? "Legal" : `${errors.length} issue${errors.length === 1 ? "" : "s"}`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 text-sm">
              <p className="mb-2 font-medium">{f.name} legality</p>
              {legality.issues.length === 0 ? (
                <p className="text-muted-foreground">No issues found.</p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {legality.issues.map((i) => (
                    <li key={i.message} className="flex gap-1.5 text-xs">
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          i.severity === "error" ? "text-destructive" : "text-warning",
                        )}
                      />
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
