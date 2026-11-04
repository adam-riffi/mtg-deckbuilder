"use client";

import { Check, X } from "lucide-react";
import { ManaCost } from "@/components/card/mana";
import { CardHoverPreview } from "@/components/deck/card-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import type { ChangeItem, ChangeSet, ChangeSetsApi } from "@/lib/use-change-sets";
import { cn } from "@/lib/utils";

const ACTION: Record<ChangeItem["action"], { label: string; cls: string }> = {
  add: { label: "+", cls: "text-success" },
  remove: { label: "−", cls: "text-destructive" },
  move: { label: "→", cls: "text-warning" },
  swap: { label: "⇄", cls: "text-primary" },
};

function CardName({ hit, fallback }: { hit: ChangeItem["card"]; fallback: string }) {
  if (!hit) return <span>{fallback}</span>;
  return (
    <CardHoverPreview card={hit.card} image={hit.image} faceImages={hit.faceImages}>
      <span className="cursor-help font-medium underline decoration-dotted">{hit.card.name}</span>
    </CardHoverPreview>
  );
}

/** Diff card for an AI proposal: accept or reject per line or all at once. */
export function ChangeSetCard({ set, api }: { set: ChangeSet; api: ChangeSetsApi }) {
  const pending = set.items.filter((i) => i.status === "pending");
  return (
    <section
      className="rounded-lg border bg-background/60 text-sm"
      aria-label={`Proposed changes: ${set.summary}`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex-1 font-medium">{set.summary || "Proposed changes"}</span>
        <Badge
          variant={set.status === "pending" ? "warning" : set.status === "applied" ? "success" : "muted"}
        >
          {set.status}
        </Badge>
      </div>
      <ul className="divide-y">
        {set.items.map((i) => (
          <li
            key={i.id}
            className={cn("flex items-start gap-2 px-3 py-1.5", i.status !== "pending" && "opacity-60")}
          >
            <span className={cn("w-4 shrink-0 text-center font-bold", ACTION[i.action].cls)} title={i.action}>
              {ACTION[i.action].label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                {i.qty > 1 && <span>{i.qty}×</span>}
                <CardName hit={i.card} fallback={i.oracleId} />
                {i.action === "swap" && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <CardName hit={i.toCard} fallback={i.toOracleId ?? "?"} />
                  </>
                )}
                {i.action === "move" && (
                  <span className="text-xs text-muted-foreground">
                    {i.fromZone} → {i.toZone}
                  </span>
                )}
                {i.category && <Badge variant="muted">{i.category}</Badge>}
                <ManaCost cost={(i.action === "swap" ? i.toCard : i.card)?.card.manaCost} size={12} />
              </div>
              <p className="text-xs text-muted-foreground">{i.reason}</p>
            </div>
            {i.status === "pending" ? (
              <div className="flex shrink-0 gap-0.5">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Accept: ${i.action} ${i.card?.card.name ?? ""}`}
                  onClick={() => api.acceptItem(set.id, i.id)}
                  disabled={api.resolving}
                >
                  <Check className="text-success" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Reject: ${i.action} ${i.card?.card.name ?? ""}`}
                  onClick={() => api.rejectItem(set.id, i.id)}
                  disabled={api.resolving}
                >
                  <X className="text-destructive" />
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">{i.status}</span>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => api.rejectAll(set.id)} disabled={api.resolving}>
            Reject all
          </Button>
          <Button size="sm" variant="success" onClick={() => api.acceptAll(set.id)} disabled={api.resolving}>
            <Check /> Accept {pending.length === set.items.length ? "all" : `${pending.length} remaining`}
          </Button>
        </div>
      )}
    </section>
  );
}
