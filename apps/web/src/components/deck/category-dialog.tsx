"use client";

import { AUTO_CATEGORIES, type DeckEntry, type DeckOp, suggestCategories } from "@mtg/mtg";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Dialog, DialogContent, Input, Label } from "@/components/ui/primitives";

function ChipInput({
  value,
  onChange,
  suggestions,
  label,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  label: string;
}) {
  const [text, setText] = useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {value.map((v) => (
          <Badge key={v} className="gap-0.5">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          }
        }}
        placeholder="Type and press Enter"
        aria-label={`Add ${label.toLowerCase()}`}
        list={`${label}-suggestions`}
      />
      <datalist id={`${label}-suggestions`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-1">
        {suggestions
          .filter((s) => !value.includes(s))
          .slice(0, 14)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

/** Edit categories (first one is the primary grouping) and tags for one or many entries. */
export function CategoryDialog({
  entries,
  onClose,
  apply,
  known,
}: {
  entries: DeckEntry[] | null;
  onClose: () => void;
  apply: (ops: DeckOp[]) => void;
  known: string[];
}) {
  const [cats, setCats] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    if (entries?.length) {
      setCats(entries.length === 1 ? entries[0]!.categories : []);
      setTags(entries.length === 1 ? entries[0]!.tags : []);
    }
  }, [entries]);
  if (!entries) return null;
  const multi = entries.length > 1;
  const suggested = entries.length === 1 ? suggestCategories(entries[0]!.card) : [];
  return (
    <Dialog open={!!entries} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={multi ? `Categories for ${entries.length} cards` : entries[0]!.card.name}
        description={
          multi
            ? "Categories and tags are added to every selected card."
            : "The first category is used for grouping."
        }
      >
        {suggested.length > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" /> Suggested: {suggested.join(", ")}
            <button
              type="button"
              className="ml-1 text-primary underline"
              onClick={() => setCats([...new Set([...cats, ...suggested])])}
            >
              apply
            </button>
          </p>
        )}
        <ChipInput
          label="Categories"
          value={cats}
          onChange={setCats}
          suggestions={[...new Set([...known, ...AUTO_CATEGORIES])]}
        />
        <ChipInput
          label="Tags"
          value={tags}
          onChange={setTags}
          suggestions={["Have", "Need", "Proxy", "Budget", "Pet card", "Combo"]}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const ops: DeckOp[] = entries.flatMap((e): DeckOp[] => [
                {
                  op: "set_categories",
                  oracleId: e.cardId,
                  zone: e.zone,
                  categories: multi ? [...new Set([...e.categories, ...cats])] : cats,
                },
                {
                  op: "set_tags",
                  oracleId: e.cardId,
                  zone: e.zone,
                  tags: multi ? [...new Set([...e.tags, ...tags])] : tags,
                },
              ]);
              apply(ops);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
