"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, GitCompare, RotateCcw, Save, Upload, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Select, Skeleton } from "@/components/ui/primitives";
import { api, type DeckPayload } from "@/lib/api";
import { cn } from "@/lib/utils";

interface EventItem {
  id: number;
  source: string;
  kind: string;
  summary: string;
  createdAt: string;
  undone: boolean;
}
interface VersionItem {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  count: number;
}
interface DiffResponse {
  a: string;
  b: string;
  names: Record<string, string>;
  diff: {
    added: { cardId: string; zone: string; qty: number }[];
    removed: { cardId: string; zone: string; qty: number }[];
    changed: { cardId: string; zone: string; from: number; to: number }[];
    printingChanged: { cardId: string; zone: string }[];
  };
}

const SOURCE_ICON: Record<string, typeof User> = { user: User, ai: Bot, import: Upload };

/** Change log, named versions, diff between any two versions/decks, and restore. */
export function HistoryPanel({
  deckId,
  onRestored,
}: {
  deckId: string;
  onRestored: (d: DeckPayload) => void;
}) {
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ["history", deckId],
    queryFn: () => api<{ events: EventItem[] }>(`/api/decks/${deckId}/history`),
  });
  const versions = useQuery({
    queryKey: ["versions", deckId],
    queryFn: () => api<{ versions: VersionItem[] }>(`/api/decks/${deckId}/versions`),
  });
  const decks = useQuery({
    queryKey: ["decks"],
    queryFn: () => api<{ decks: { deck: { id: string; name: string } }[] }>("/api/decks"),
  });
  const [name, setName] = useState("");
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("current");
  const [otherDeck, setOtherDeck] = useState<string>(deckId);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/decks/${deckId}/versions`, {
        method: "POST",
        json: { name: name || new Date().toLocaleString() },
      }),
    onSuccess: () => {
      setName("");
      toast.success("Version saved");
      qc.invalidateQueries({ queryKey: ["versions", deckId] });
    },
  });
  const restore = useMutation({
    mutationFn: (vid: string) =>
      api<DeckPayload & { summary: string }>(`/api/decks/${deckId}/versions/${vid}`, { method: "POST" }),
    onSuccess: (d) => {
      onRestored({ deck: d.deck, entries: d.entries });
      toast.success(`${d.summary}. Undo is available.`);
      qc.invalidateQueries({ queryKey: ["history", deckId] });
    },
  });
  const side = (v: string, deck: string) => ({ deckId: deck, versionId: v === "current" ? null : v });
  const diff = useQuery({
    queryKey: ["diff", deckId, a, b, otherDeck],
    queryFn: () =>
      api<DiffResponse>("/api/decks/diff", {
        method: "POST",
        json: { a: side(a, deckId), b: side(b, otherDeck) },
      }),
    enabled: !!a,
  });

  const versionOptions = [
    { value: "current", label: "Current deck" },
    ...(versions.data?.versions ?? []).map((v) => ({ value: v.id, label: `${v.name} (${v.count})` })),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="versions-h" className="space-y-3">
        <h2 id="versions-h" className="font-semibold">
          Versions
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Version name (e.g. Before budget cuts)"
            aria-label="Version name"
          />
          <Button type="submit" disabled={save.isPending}>
            <Save /> Save
          </Button>
        </form>
        {versions.isLoading ? (
          <Skeleton className="h-24" />
        ) : versions.data?.versions.length ? (
          <ul className="divide-y rounded-md border">
            {versions.data.versions.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">
                  {v.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {v.count} cards · {new Date(v.createdAt).toLocaleString()}
                  </span>
                </span>
                <Button size="xs" variant="ghost" onClick={() => setA(v.id)}>
                  <GitCompare /> Compare
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => confirm(`Restore "${v.name}"? You can undo this.`) && restore.mutate(v.id)}
                >
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No versions yet. Save one before big changes so you can compare or roll back.
          </p>
        )}

        <h2 className="pt-2 font-semibold">Compare</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select
            aria-label="Compare from"
            value={a || "none"}
            onValueChange={(v) => setA(v === "none" ? "" : v)}
            options={[{ value: "none", label: "Pick a version…" }, ...versionOptions]}
            className="w-52"
          />
          <span>→</span>
          <Select
            aria-label="Compare deck"
            value={otherDeck}
            onValueChange={(v) => {
              setOtherDeck(v);
              setB("current");
            }}
            options={(decks.data?.decks ?? []).map((d) => ({ value: d.deck.id, label: d.deck.name }))}
            className="w-44"
          />
          {otherDeck === deckId && (
            <Select
              aria-label="Compare to"
              value={b}
              onValueChange={setB}
              options={versionOptions}
              className="w-44"
            />
          )}
        </div>
        {diff.data && <DiffView d={diff.data} />}
      </section>

      <section aria-labelledby="log-h" className="space-y-3">
        <h2 id="log-h" className="font-semibold">
          Change log
        </h2>
        {events.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <ol className="divide-y rounded-md border">
            {(events.data?.events ?? []).map((e) => {
              const Icon = SOURCE_ICON[e.source] ?? User;
              return (
                <li
                  key={e.id}
                  className={cn("flex items-start gap-2 px-3 py-1.5 text-sm", e.undone && "opacity-50")}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={e.source} />
                  <span className="flex-1">
                    {e.summary}
                    {e.source === "ai" && (
                      <Badge variant="default" className="ml-1">
                        AI
                      </Badge>
                    )}
                    {e.undone && <span className="ml-1 text-xs">(undone)</span>}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </time>
                </li>
              );
            })}
            {!events.data?.events.length && (
              <li className="p-3 text-sm text-muted-foreground">No changes yet.</li>
            )}
          </ol>
        )}
      </section>
    </div>
  );
}

function DiffView({ d }: { d: DiffResponse }) {
  const n = (id: string) => d.names[id] ?? id;
  const empty =
    !d.diff.added.length &&
    !d.diff.removed.length &&
    !d.diff.changed.length &&
    !d.diff.printingChanged.length;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {d.a} → {d.b}
      </p>
      {empty ? (
        <p className="text-muted-foreground">No differences.</p>
      ) : (
        <ul className="space-y-0.5">
          {d.diff.added.map((x) => (
            <li key={`a${x.zone}${x.cardId}`} className="text-success">
              + {x.qty} {n(x.cardId)} <span className="text-xs text-muted-foreground">({x.zone})</span>
            </li>
          ))}
          {d.diff.removed.map((x) => (
            <li key={`r${x.zone}${x.cardId}`} className="text-destructive">
              − {x.qty} {n(x.cardId)} <span className="text-xs text-muted-foreground">({x.zone})</span>
            </li>
          ))}
          {d.diff.changed.map((x) => (
            <li key={`c${x.zone}${x.cardId}`} className="text-warning">
              ~ {n(x.cardId)}: {x.from} → {x.to}
            </li>
          ))}
          {d.diff.printingChanged.map((x) => (
            <li key={`p${x.zone}${x.cardId}`} className="text-muted-foreground">
              ~ {n(x.cardId)}: printing changed
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
