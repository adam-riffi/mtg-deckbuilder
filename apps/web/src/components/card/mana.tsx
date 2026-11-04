import { parseManaCost } from "@mtg/mtg";
import { cn } from "@/lib/utils";

/** Scryfall's symbol SVGs (loaded from their CDN). "{W/U}" → "WU.svg". */
export function symbolUrl(sym: string): string {
  return `https://svgs.scryfall.io/card-symbols/${sym.replace(/\//g, "")}.svg`;
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
        // biome-ignore lint/performance/noImgElement: tiny static SVGs from Scryfall's CDN
        <img
          key={i}
          src={symbolUrl(s)}
          alt={`{${s}}`}
          width={size}
          height={size}
          className="inline-block"
          loading="lazy"
        />
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
