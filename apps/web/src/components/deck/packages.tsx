"use client";

import { CATEGORY_TEMPLATES, type DeckOp } from "@mtg/mtg";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Skeleton } from "@/components/ui/primitives";
import { api, type DeckPayload } from "@/lib/api";

interface DeckItem {
  deck: { id: string; name: string; isPackage: boolean };
  count: number;
}

/** Adds every card from a reusable card package (a deck marked as package) to this deck. */
export function PackageDialog({
  open,
  onOpenChange,
  deckId,
  apply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deckId: string;
  apply: (ops: DeckOp[], summary?: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["decks", "packages"],
    queryFn: () => api<{ decks: DeckItem[] }>("/api/decks?packages=true"),
    enabled: open,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const add = async (pkg: DeckItem) => {
    setBusy(pkg.deck.id);
    try {
      const d = await api<DeckPayload>(`/api/decks/${pkg.deck.id}`);
      const ops: DeckOp[] = d.entries.map((e) => ({
        op: "add",
        oracleId: e.cardId,
        qty: e.qty,
        zone: e.zone === "commander" ? "mainboard" : e.zone,
        printingId: e.printingId,
        categories: e.categories,
        finish: e.finish,
      }));
      apply(ops, `Added package "${pkg.deck.name}" (${ops.length} cards)`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const packages = (data?.decks ?? []).filter((d) => d.deck.id !== deckId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add card package"
        description="Packages are reusable groups of cards (e.g. a mana base or a removal suite). Create one from the dashboard's Card packages section."
      >
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No packages yet. On the dashboard, open “Card packages” and create one, or convert an existing
            deck.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {packages.map((p) => (
              <li key={p.deck.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {p.deck.name} <span className="text-xs text-muted-foreground">· {p.count} cards</span>
                </span>
                <Button size="sm" onClick={() => add(p)} disabled={busy !== null}>
                  {busy === p.deck.id ? "Adding…" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Applies a category template: sets the category order shown when grouping by category. */
export function TemplateDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (cats: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Category templates"
        description="Sets the category order (and targets) used when grouping by category."
      >
        <ul className="space-y-2">
          {Object.entries(CATEGORY_TEMPLATES).map(([name, cats]) => (
            <li key={name} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{name}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    onApply(cats.map((c) => c.name));
                    onOpenChange(false);
                    toast.success(`Applied "${name}"`);
                  }}
                >
                  Apply
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {cats.map((c) => (c.target ? `${c.name} (${c.target})` : c.name)).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
