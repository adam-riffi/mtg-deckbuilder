"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDebounced } from "@/components/deck/search-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Input, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

interface Item {
  printingId: string;
  oracleId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  finish: string;
  qty: number;
  condition: string;
  language: string;
  eur: number | null;
  usd: number | null;
  image: string | null;
}
interface CollectionResponse {
  total: number;
  items: Item[];
  summary: { cards: number; unique: number; eur: number; usd: number };
}

export function CollectionPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [importOpen, setImportOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["collection", dq],
    queryFn: () => api<CollectionResponse>(`/api/collection?q=${encodeURIComponent(dq)}&limit=500`),
  });
  const setQty = useMutation({
    mutationFn: (v: {
      printingId: string;
      finish: string;
      condition: string;
      language: string;
      qty: number;
    }) => api("/api/collection/items", { method: "POST", json: { ...v, mode: "set" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collection"] }),
  });
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Collection</h1>
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.summary.cards.toLocaleString()} cards · {data.summary.unique.toLocaleString()} unique ·{" "}
            {formatPrice(data.summary.eur, "eur")} / {formatPrice(data.summary.usd, "usd")}
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name"
            className="w-56 pl-8"
            aria-label="Filter collection"
          />
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <Upload /> Import CSV
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Owned and missing cards appear as overlays in the deck editor, with the cost to complete each deck.
      </p>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data?.items.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{q ? "No matching cards" : "Your collection is empty"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import a CSV export from Moxfield, Archidekt or ManaBox, or add cards from a card's detail page.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-2 py-1.5 font-medium">Card</th>
                <th className="px-2 py-1.5 font-medium">Set</th>
                <th className="px-2 py-1.5 font-medium">Finish</th>
                <th className="px-2 py-1.5 font-medium">Cond.</th>
                <th className="px-2 py-1.5 font-medium">Lang</th>
                <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="px-2 py-1.5 text-right font-medium">EUR</th>
                <th className="px-2 py-1.5 text-right font-medium">USD</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={`${i.printingId}${i.finish}${i.condition}${i.language}`} className="border-t">
                  <td className="px-2 py-1">{i.name}</td>
                  <td className="px-2 py-1 font-mono text-xs uppercase">
                    {i.setCode} {i.collectorNumber}
                  </td>
                  <td className="px-2 py-1">{i.finish}</td>
                  <td className="px-2 py-1">{i.condition}</td>
                  <td className="px-2 py-1">{i.language}</td>
                  <td className="px-2 py-1 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove one ${i.name}`}
                        onClick={() => setQty.mutate({ ...i, qty: i.qty - 1 })}
                      >
                        <Minus />
                      </Button>
                      <span className="w-6 text-center tabular-nums">{i.qty}</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Add one ${i.name}`}
                        onClick={() => setQty.mutate({ ...i, qty: i.qty + 1 })}
                      >
                        <Plus />
                      </Button>
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatPrice(i.eur == null ? null : i.eur * i.qty, "eur")}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatPrice(i.usd == null ? null : i.usd * i.qty, "usd")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ImportCollectionDialog open={importOpen} onOpenChange={setImportOpen} />
    </main>
  );
}

function ImportCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [result, setResult] = useState<{
    source: string;
    imported: number;
    unresolved: { lineNo: number; name: string }[];
  } | null>(null);
  const run = useMutation({
    mutationFn: () =>
      api<{ source: string; imported: number; unresolved: { lineNo: number; name: string }[] }>(
        "/api/collection/import",
        { method: "POST", json: { csv, mode } },
      ),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Imported ${r.imported} cards from ${r.source}`);
      qc.invalidateQueries({ queryKey: ["collection"] });
      qc.invalidateQueries({ queryKey: ["collection-overlay"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setResult(null);
      }}
    >
      <DialogContent
        title="Import collection"
        description="CSV exports from Moxfield, Archidekt or ManaBox. Columns are detected automatically."
      >
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
          className="text-sm"
        />
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className="min-h-40 font-mono text-xs"
          placeholder="…or paste CSV here"
          aria-label="CSV content"
        />
        <div className="flex items-center gap-2">
          <Select
            aria-label="Import mode"
            value={mode}
            onValueChange={(v) => setMode(v as "add")}
            options={[
              { value: "add", label: "Add to collection" },
              { value: "replace", label: "Replace collection" },
            ]}
          />
          <Button className="ml-auto" onClick={() => run.mutate()} disabled={!csv.trim() || run.isPending}>
            {run.isPending ? "Importing…" : "Import"}
          </Button>
        </div>
        {result && result.unresolved.length > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-2 text-xs" role="status">
            <p className="font-medium">{result.unresolved.length} rows not found:</p>
            <ul className="mt-1 max-h-40 overflow-y-auto">
              {result.unresolved.map((u) => (
                <li key={u.lineNo}>
                  Line {u.lineNo}: {u.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
