"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCommandStore } from "@/stores/command-store";

interface DeckListItem {
  deck: { id: string; name: string; format: string };
}

/** Global Ctrl/Cmd+K palette: jump to decks, cards, pages, and run editor commands registered by the current page. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const commands = useCommandStore((s) => s.commands);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const decks = useQuery({
    queryKey: ["decks"],
    queryFn: () => api<{ decks: DeckListItem[] }>("/api/decks"),
    enabled: open,
  });
  const cards = useQuery({
    queryKey: ["autocomplete", q],
    queryFn: () =>
      api<{ results: { id: string; name: string }[] }>(`/api/cards/autocomplete?q=${encodeURIComponent(q)}`),
    enabled: open && q.length >= 2,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed top-[15vh] left-1/2 z-50 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-2xl">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search decks, cards and commands
          </DialogPrimitive.Description>
          <Command shouldFilter={false} className="flex flex-col" label="Command palette">
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Type a command, deck or card name…"
              className="h-11 border-b bg-transparent px-4 text-sm outline-none"
            />
            <Command.List className="max-h-[60vh] overflow-y-auto p-1 text-sm">
              <Command.Empty className="p-4 text-center text-muted-foreground">No results.</Command.Empty>
              {commands.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase())).length > 0 && (
                <Command.Group
                  heading="Commands"
                  className="px-1 py-1 text-xs text-muted-foreground [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:text-foreground"
                >
                  {commands
                    .filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()))
                    .map((c) => (
                      <Command.Item
                        key={c.id}
                        value={`cmd-${c.id}`}
                        onSelect={() => {
                          setOpen(false);
                          c.run();
                        }}
                        className="flex cursor-default items-center justify-between rounded px-2 py-1.5 data-[selected=true]:bg-accent"
                      >
                        {c.label}
                        {c.shortcut && (
                          <span className="font-mono text-xs text-muted-foreground">{c.shortcut}</span>
                        )}
                      </Command.Item>
                    ))}
                </Command.Group>
              )}
              <Command.Group
                heading="Pages"
                className="px-1 py-1 text-xs text-muted-foreground [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:text-foreground"
              >
                {[
                  ["Decks", "/decks"],
                  ["Card search", "/search"],
                  ["Collection", "/collection"],
                  ["Settings", "/settings"],
                ]
                  .filter(([l]) => !q || l!.toLowerCase().includes(q.toLowerCase()))
                  .map(([label, href]) => (
                    <Command.Item
                      key={href}
                      value={`page-${href}`}
                      onSelect={() => go(href!)}
                      className="rounded px-2 py-1.5 data-[selected=true]:bg-accent"
                    >
                      {label}
                    </Command.Item>
                  ))}
              </Command.Group>
              <Command.Group
                heading="Decks"
                className="px-1 py-1 text-xs text-muted-foreground [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:text-foreground"
              >
                {(decks.data?.decks ?? [])
                  .filter((d) => !q || d.deck.name.toLowerCase().includes(q.toLowerCase()))
                  .slice(0, 8)
                  .map((d) => (
                    <Command.Item
                      key={d.deck.id}
                      value={`deck-${d.deck.id}`}
                      onSelect={() => go(`/decks/${d.deck.id}`)}
                      className="rounded px-2 py-1.5 data-[selected=true]:bg-accent"
                    >
                      {d.deck.name} <span className="text-xs text-muted-foreground">· {d.deck.format}</span>
                    </Command.Item>
                  ))}
              </Command.Group>
              {(cards.data?.results.length ?? 0) > 0 && (
                <Command.Group
                  heading="Cards"
                  className="px-1 py-1 text-xs text-muted-foreground [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:text-foreground"
                >
                  {cards.data!.results.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`card-${c.id}`}
                      onSelect={() => go(`/cards/${c.id}`)}
                      className="rounded px-2 py-1.5 data-[selected=true]:bg-accent"
                    >
                      {c.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
