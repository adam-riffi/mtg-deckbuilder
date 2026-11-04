"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Label, Select, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useEditor } from "@/stores/editor-store";

interface Run {
  finishedAt: string | null;
  sourceUpdatedAt: string | null;
  counts: Record<string, number>;
}
interface Settings {
  currency: "eur" | "usd";
  combosEnabled: boolean;
  brackets: unknown;
  bracketsCustomised: boolean;
  aiConfigured: boolean;
  ingest: { bulk: Run | null; fixtures: Run | null };
}

export function SettingsPage() {
  const qc = useQueryClient();
  const setCurrency = useEditor((s) => s.setCurrency);
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/api/settings"),
  });
  const [bracketText, setBracketText] = useState("");
  useEffect(() => {
    if (data) setBracketText(JSON.stringify(data.brackets, null, 2));
  }, [data]);
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api("/api/settings", { method: "PUT", json: patch }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading || !data) return <Skeleton className="m-4 h-96" />;
  const run = data.ingest.bulk ?? data.ingest.fixtures;
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="space-y-2">
        <h2 className="font-medium">Prices</h2>
        <div className="flex items-center gap-2">
          <Label>Default currency</Label>
          <Select
            aria-label="Default currency"
            value={data.currency}
            onValueChange={(v) => {
              setCurrency(v as "eur");
              save.mutate({ currency: v });
            }}
            options={[
              { value: "eur", label: "EUR (Cardmarket)" },
              { value: "usd", label: "USD (TCGplayer)" },
            ]}
            className="w-48"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Card data</h2>
        <p className="text-sm text-muted-foreground">
          {run ? (
            <>
              Last ingest {data.ingest.bulk ? "from Scryfall bulk data" : "from offline fixtures"}:{" "}
              {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}
              {run.counts.oracle
                ? ` · ${run.counts.oracle.toLocaleString()} cards, ${run.counts.printings?.toLocaleString() ?? 0} printings`
                : ""}
            </>
          ) : (
            "No card data ingested yet. Run `pnpm ingest` (Scryfall) or `pnpm ingest:fixtures`."
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          The worker refreshes bulk data and records a price snapshot daily.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">AI assistant</h2>
        <p className="text-sm">
          API key:{" "}
          {data.aiConfigured ? (
            <Badge variant="success">configured</Badge>
          ) : (
            <Badge variant="warning">missing — set ANTHROPIC_API_KEY in .env</Badge>
          )}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Switch
            checked={data.combosEnabled}
            onCheckedChange={(v) => save.mutate({ combosEnabled: v })}
            aria-label="Enable Commander Spellbook combo lookup"
          />
          Enable combo lookup via Commander Spellbook (sends your deck's card names to commanderspellbook.com;
          review their terms first)
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Commander bracket rules</h2>
        <p className="text-sm text-muted-foreground">
          Brackets are in beta. Edit limits and detectors here when Wizards updates them.{" "}
          {data.bracketsCustomised ? "Using a customised config." : "Using the built-in config."}
        </p>
        <Textarea
          value={bracketText}
          onChange={(e) => setBracketText(e.target.value)}
          className="min-h-80 font-mono text-xs"
          aria-label="Bracket config JSON"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => {
              try {
                save.mutate({ brackets: JSON.parse(bracketText) });
              } catch {
                toast.error("Invalid JSON");
              }
            }}
          >
            Save bracket config
          </Button>
          {data.bracketsCustomised && (
            <Button variant="outline" onClick={() => save.mutate({ brackets: null })}>
              Reset to built-in
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
