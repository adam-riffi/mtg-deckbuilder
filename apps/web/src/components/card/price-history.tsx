"use client";

import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";

export interface PricePoint {
  day: string;
  usd: number | null;
  eur: number | null;
  usdFoil: number | null;
  eurFoil: number | null;
}

export function PriceChart({ points, height = 220 }: { points: PricePoint[]; height?: number }) {
  if (points.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No price history yet. A snapshot is recorded on every daily ingest.
      </p>
    );
  return (
    <div style={{ height }} role="img" aria-label="Price history chart">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="eur"
            name="EUR"
            stroke="var(--color-primary)"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="usd"
            name="USD"
            stroke="var(--color-success)"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceHistory({ printingId }: { printingId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["price-history", printingId],
    queryFn: () => api<{ points: PricePoint[] }>(`/api/prices/printing/${printingId}`),
    enabled: !!printingId,
  });
  if (!printingId) return null;
  if (isLoading) return <Skeleton className="h-56" />;
  return <PriceChart points={data?.points ?? []} />;
}
