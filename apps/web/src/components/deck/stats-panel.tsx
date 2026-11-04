"use client";

import {
  type BracketEstimate,
  COLOR_NAMES,
  COLORS,
  type DeckEntry,
  type DeckStats,
  drawChance,
  entriesIn,
  type LegalityReport,
  TYPE_GROUP_ORDER,
} from "@mtg/mtg";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PriceChart, type PricePoint } from "@/components/card/price-history";
import { Input, Label, Select } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  Creature: "#4ade80",
  Planeswalker: "#f472b6",
  Battle: "#fb923c",
  Instant: "#60a5fa",
  Sorcery: "#f87171",
  Artifact: "#a8a29e",
  Enchantment: "#c084fc",
  Other: "#94a3b8",
};
const MANA_COLORS: Record<string, string> = {
  W: "#f8f6d8",
  U: "#5aa9e6",
  B: "#8c7a8c",
  R: "#e8604c",
  G: "#4caf6e",
  C: "#b8b8b8",
};
const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  fontSize: 12,
  color: "var(--color-foreground)",
};

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border bg-card p-3 ${className ?? ""}`} aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function StatsPanel({
  deckId,
  entries,
  stats,
  format,
  currency,
  legality,
  bracket,
}: {
  deckId: string;
  entries: DeckEntry[];
  stats: DeckStats;
  format: string;
  currency: "eur" | "usd";
  legality: LegalityReport;
  bracket: BracketEstimate | null;
}) {
  const curveData = stats.curve.map((b) => ({ mv: b.mv === 7 ? "7+" : String(b.mv), ...b.byType }));
  const types = TYPE_GROUP_ORDER.filter(
    (t) => t !== "Land" && t !== "Commander" && stats.curve.some((b) => b.byType[t]),
  );
  const pipData = [...COLORS, "C" as const]
    .map((c) => ({ color: c, pips: stats.pips[c], sources: stats.sources[c] }))
    .filter((d) => d.pips || d.sources);
  const categoryData = Object.entries(stats.categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  const priceByCat = Object.entries(stats.price.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  const history = useQuery({
    queryKey: ["deck-prices", deckId],
    queryFn: () => api<{ points: PricePoint[] }>(`/api/decks/${deckId}/prices`),
  });

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      <Panel title="Summary">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Cards</dt>
          <dd>{stats.totalCards}</dd>
          <dt className="text-muted-foreground">Lands</dt>
          <dd>
            {stats.landCount}{" "}
            <span className="text-xs text-muted-foreground">
              (suggested {stats.landGuidance.min}–{stats.landGuidance.max})
            </span>
          </dd>
          <dt className="text-muted-foreground">Average MV (non-land)</dt>
          <dd>{stats.averageMv.toFixed(2)}</dd>
          <dt className="text-muted-foreground">Average MV (incl. lands)</dt>
          <dd>{stats.averageMvWithLands.toFixed(2)}</dd>
          <dt className="text-muted-foreground">Price</dt>
          <dd>
            {formatPrice(stats.price.total, currency)}
            {stats.price.missing > 0 && (
              <span className="text-xs text-muted-foreground"> ({stats.price.missing} without price)</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Legality</dt>
          <dd className={legality.legal ? "text-success" : "text-destructive"}>
            {legality.legal
              ? "Legal"
              : `${legality.issues.filter((i) => i.severity === "error").length} issues`}
          </dd>
          {bracket && (
            <>
              <dt className="text-muted-foreground">Bracket estimate</dt>
              <dd>
                {bracket.bracket} — {bracket.name} ({bracket.gameChangers.length} Game Changers)
              </dd>
            </>
          )}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Land guidance: {stats.landGuidance.explanation}</p>
      </Panel>

      <Panel title="Mana curve (non-land, by type)" className="lg:col-span-1 2xl:col-span-2">
        <div className="h-56" role="img" aria-label="Mana curve chart">
          <ResponsiveContainer>
            <BarChart data={curveData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="mv" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {types.map((t) => (
                <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t] ?? "#94a3b8"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Colour: pips vs sources">
        <div className="h-52" role="img" aria-label="Pips versus sources chart">
          <ResponsiveContainer>
            <BarChart data={pipData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="color" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="pips" name="Pips in costs">
                {pipData.map((d) => (
                  <Cell key={d.color} fill={MANA_COLORS[d.color]} />
                ))}
              </Bar>
              <Bar dataKey="sources" name="Mana sources" fill="var(--color-primary)" fillOpacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">Colour</th>
              <th className="text-right font-normal">Pip share</th>
              <th className="text-right font-normal">Source share</th>
            </tr>
          </thead>
          <tbody>
            {COLORS.filter((c) => stats.pips[c] || stats.sources[c]).map((c) => {
              const gap = stats.pipShare[c] - stats.sourceShare[c];
              return (
                <tr key={c}>
                  <td>{COLOR_NAMES[c]}</td>
                  <td className="text-right">{Math.round(stats.pipShare[c] * 100)}%</td>
                  <td className={`text-right ${gap > 0.1 ? "text-warning" : ""}`}>
                    {Math.round(stats.sourceShare[c] * 100)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Categories">
        {categoryData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {categoryData.map((c) => (
              <li key={c.name} className="flex items-center gap-2">
                <span className="w-32 truncate">{c.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    className="block h-full bg-primary"
                    style={{ width: `${(c.value / Math.max(1, stats.totalCards)) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right tabular-nums">{c.value}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Price breakdown (${currency.toUpperCase()})`}>
        {priceByCat.length > 0 && (
          <div className="h-44" role="img" aria-label="Price by category">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={priceByCat} dataKey="value" nameKey="name" outerRadius={70} innerRadius={35}>
                  {priceByCat.map((p, i) => (
                    <Cell key={p.name} fill={`oklch(0.7 0.14 ${(i * 47) % 360})`} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-xs font-medium">Most expensive</p>
        <ol className="space-y-0.5 text-xs">
          {stats.price.top.map((t) => (
            <li key={t.name} className="flex justify-between">
              <span className="truncate">{t.name}</span>
              <span className="tabular-nums">{formatPrice(t.price, currency)}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Draw odds (hypergeometric)">
        <Hypergeometric entries={entries} format={format} />
      </Panel>

      <Panel title="Deck value over time" className="2xl:col-span-2">
        <PriceChart points={history.data?.points ?? []} height={200} />
      </Panel>
    </div>
  );
}

function Hypergeometric({ entries, format }: { entries: DeckEntry[]; format: string }) {
  const library = entriesIn(entries, ["mainboard"]);
  const deckSize = library.reduce((n, e) => n + e.qty, 0);
  const categories = useMemo(() => [...new Set(library.flatMap((e) => e.categories))].sort(), [library]);
  const [cat, setCat] = useState<string>(
    categories.includes("Ramp") ? "Ramp" : (categories[0] ?? "__custom"),
  );
  const [custom, setCustom] = useState(10);
  const [turn, setTurn] = useState(3);
  const [atLeast, setAtLeast] = useState(1);
  const [onPlay, setOnPlay] = useState(true);
  const hits =
    cat === "__custom"
      ? custom
      : library.filter((e) => e.categories.includes(cat)).reduce((n, e) => n + e.qty, 0);
  const p =
    deckSize > 0
      ? drawChance({ deckSize, hits: Math.min(hits, deckSize), turn, atLeast, onThePlay: onPlay })
      : 0;
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Cards that count</Label>
          <Select
            aria-label="Category to draw"
            value={cat}
            onValueChange={setCat}
            options={[
              ...categories.map((c) => ({ value: c, label: c })),
              { value: "__custom", label: "Custom count" },
            ]}
          />
        </div>
        {cat === "__custom" && (
          <div className="space-y-1">
            <Label htmlFor="hg-custom">Copies in library</Label>
            <Input
              id="hg-custom"
              type="number"
              min={0}
              max={deckSize}
              value={custom}
              onChange={(e) => setCustom(Number(e.target.value))}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="hg-atleast">At least</Label>
          <Input
            id="hg-atleast"
            type="number"
            min={1}
            max={7}
            value={atLeast}
            onChange={(e) => setAtLeast(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hg-turn">By turn</Label>
          <Input
            id="hg-turn"
            type="number"
            min={1}
            max={15}
            value={turn}
            onChange={(e) => setTurn(Number(e.target.value))}
          />
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={onPlay} onChange={(e) => setOnPlay(e.target.checked)} /> On the play
        (no draw on turn 1)
      </label>
      <p className="rounded-md bg-muted p-2" aria-live="polite">
        P(≥{atLeast} {cat === "__custom" ? "hit" : cat} by turn {turn}) ={" "}
        <strong className="text-lg">{(p * 100).toFixed(1)}%</strong>
        <span className="block text-xs text-muted-foreground">
          {hits} of {deckSize} library cards{format === "commander" ? " (commander excluded)" : ""}; 7-card
          opening hand, no mulligans.
        </span>
      </p>
    </div>
  );
}
