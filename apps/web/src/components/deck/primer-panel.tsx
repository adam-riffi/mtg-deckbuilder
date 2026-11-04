"use client";

import type { DeckEntry } from "@mtg/mtg";
import { useQuery } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import { Children, isValidElement, type ReactNode, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { CardHoverPreview } from "./card-preview";

/** Markdown primer. Card names in [[double brackets]] get hover previews. */
export function PrimerPanel({
  primer,
  entries,
  onSave,
}: {
  primer: string;
  entries: DeckEntry[];
  onSave: (p: string) => void;
}) {
  const [editing, setEditing] = useState(primer.trim() === "");
  const [draft, setDraft] = useState(primer);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Primer</h2>
        <p className="text-xs text-muted-foreground">
          Markdown. Write card names as [[Sol Ring]] for hover previews.
        </p>
        <div className="ml-auto flex gap-1">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(primer);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              >
                <Eye /> Save &amp; preview
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[60vh] font-mono text-sm"
          aria-label="Primer markdown"
          placeholder={"# Game plan\n\nRamp into [[Craterhoof Behemoth]]…"}
        />
      ) : primer.trim() ? (
        <PrimerView markdown={primer} entries={entries} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No primer yet. The assistant can draft one: ask it to "write a primer".
        </p>
      )}
    </div>
  );
}

function PrimerView({ markdown, entries }: { markdown: string; entries: DeckEntry[] }) {
  const names = useMemo(
    () => [...new Set([...markdown.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim()))],
    [markdown],
  );
  const inDeck = new Map(entries.map((e) => [e.card.name.toLowerCase(), e]));
  const missing = names.filter((n) => !inDeck.has(n.toLowerCase()));
  const resolved = useQuery({
    queryKey: ["resolve", missing],
    queryFn: () =>
      api<{ hits: { card: { name: string; id: string }; image: never; faceImages: never }[] }>(
        "/api/cards/resolve",
        { method: "POST", json: { names: missing } },
      ),
    enabled: missing.length > 0,
  });
  const hitByName = new Map((resolved.data?.hits ?? []).map((h) => [h.card.name.toLowerCase(), h]));
  // Turn [[Name]] into links the renderer can recognise.
  const md = markdown.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, n: string) => `[${n.trim()}](card:${encodeURIComponent(n.trim())})`,
  );
  return (
    <article className="prose-primer">
      <ReactMarkdown
        urlTransform={(u) => u}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("card:")) {
              const name = decodeURIComponent(href.slice(5));
              const e = inDeck.get(name.toLowerCase());
              const h = hitByName.get(name.toLowerCase());
              const label = textOf(children);
              if (e)
                return (
                  <CardHoverPreview card={e.card} printing={e.printing}>
                    <span className="cursor-help font-medium text-primary underline decoration-dotted">
                      {label}
                    </span>
                  </CardHoverPreview>
                );
              if (h)
                return (
                  <CardHoverPreview card={h.card} image={h.image} faceImages={h.faceImages}>
                    <span className="cursor-help font-medium text-primary underline decoration-dotted">
                      {label}
                    </span>
                  </CardHoverPreview>
                );
              return <span className="font-medium">{label}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {md}
      </ReactMarkdown>
    </article>
  );
}

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) =>
      typeof c === "string"
        ? c
        : isValidElement(c)
          ? textOf((c.props as { children?: ReactNode }).children)
          : "",
    )
    .join("");
}
