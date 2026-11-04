"use client";

import { parseManaCost } from "@mtg/mtg";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Scryfall's symbol SVGs (loaded from their CDN). "{W/U}" → "WU.svg". */
export function symbolUrl(sym: string): string {
  return `https://svgs.scryfall.io/card-symbols/${sym.replace(/\//g, "")}.svg`;
}

/** Mana symbol from Scryfall's CDN, falling back to a text pip if the image cannot load (e.g. offline). */
function ManaSymbol({ sym, size }: { sym: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-muted px-1 font-mono text-[10px] leading-none"
        style={{ minWidth: size, height: size }}
      >
        {sym}
      </span>
    );
  return (
    // biome-ignore lint/performance/noImgElement: tiny static SVGs from Scryfall's CDN
    <img
      src={symbolUrl(sym)}
      alt={`{${sym}}`}
      width={size}
      height={size}
      className="inline-block"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function ManaCost({
  cost,
  className,
  size = 14,
}: {
  cost: string | null | undefined;
  className?: string;
  size?: number;
}) {
  const syms = parseManaCost(cost);
  if (!syms.length) return null;
  return (
    <span className={cn("inline-flex items-center gap-px", className)} role="img" aria-label={cost ?? ""}>
      {syms.map((s, i) => (
        <ManaSymbol key={i} sym={s} size={size} />
      ))}
    </span>
  );
}

/** Renders oracle text with inline mana symbols. */
export function OracleText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5 text-sm leading-relaxed", className)}>
      {text.split("\n").map((line, i) => (
        <p key={i}>
          {line
            .split(/(\{[^}]+\})/g)
            .map((part, j) =>
              /^\{[^}]+\}$/.test(part) ? (
                <ManaCost key={j} cost={part} size={13} className="mx-px align-[-2px]" />
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
        </p>
      ))}
    </div>
  );
}

const COLOR_PIP: Record<string, string> = { W: "W", U: "U", B: "B", R: "R", G: "G" };

export function ColorPips({ colors, size = 14 }: { colors: readonly string[]; size?: number }) {
  if (!colors.length) return <ManaCost cost="{C}" size={size} />;
  return <ManaCost cost={colors.map((c) => `{${COLOR_PIP[c] ?? c}}`).join("")} size={size} />;
}
