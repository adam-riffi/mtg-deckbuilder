"use client";

import { colorMask, FORMATS, maskToColors } from "@mtg/mtg";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Folder, FolderPlus, MoreHorizontal, Package, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ColorPips } from "@/components/card/mana";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";

interface DeckItem {
  deck: {
    id: string;
    name: string;
    format: string;
    folderId: string | null;
    tags: string[];
    isPackage: boolean;
    targetBracket: number | null;
    updatedAt: string;
  };
  count: number;
  commanders: string[];
  identity: number;
  cover: string | null;
  priceEur: number;
  priceUsd: number;
}
interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
}

const COLOR_FILTERS = ["W", "U", "B", "R", "G"] as const;

export function DeckDashboard() {
  const qc = useQueryClient();
  const router = useRouter();
  const decks = useQuery({ queryKey: ["decks"], queryFn: () => api<{ decks: DeckItem[] }>("/api/decks") });
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: () => api<{ folders: FolderItem[] }>("/api/folders"),
  });
  const [folder, setFolder] = useState<string | "all" | "root" | "packages">("all");
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("any");
  const [bracket, setBracket] = useState("any");
  const [colors, setColors] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const list = decks.data?.decks ?? [];
    const want = colorMask(colors);
    return list.filter((d) => {
      if (folder === "packages") {
        if (!d.deck.isPackage) return false;
      } else if (d.deck.isPackage) return false;
      if (folder === "root" && d.deck.folderId) return false;
      if (folder !== "all" && folder !== "root" && folder !== "packages" && d.deck.folderId !== folder)
        return false;
      if (format !== "any" && d.deck.format !== format) return false;
      if (bracket !== "any" && String(d.deck.targetBracket ?? "") !== bracket) return false;
      if (want && (d.identity & want) !== want) return false;
      if (q) {
        const s = q.toLowerCase();
        const hay = [d.deck.name, ...d.commanders, ...d.deck.tags].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [decks.data, folder, q, format, bracket, colors]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["decks"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
  };
  const patchDeck = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api(`/api/decks/${id}`, { method: "PATCH", json: patch }),
    onSuccess: invalidate,
  });
  const removeDeck = useMutation({
    mutationFn: (id: string) => api(`/api/decks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Deck deleted");
      invalidate();
    },
  });
  const cloneDeck = useMutation({
    mutationFn: (id: string) =>
      api<{ deck: { id: string } }>(`/api/decks/${id}/clone`, { method: "POST", json: {} }),
    onSuccess: (r) => {
      invalidate();
      router.push(`/decks/${r.deck.id}`);
    },
  });
  const addFolder = useMutation({
    mutationFn: (name: string) => api("/api/folders", { method: "POST", json: { name } }),
    onSuccess: invalidate,
  });
  const removeFolder = useMutation({
    mutationFn: (id: string) => api(`/api/folders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setFolder("all");
      invalidate();
    },
  });

  const folderList = folders.data?.folders ?? [];

  return (
    <div className="flex min-h-[calc(100vh-3rem)]">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r p-3 md:flex" aria-label="Folders">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Folders</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New folder"
            onClick={() => {
              const name = prompt("Folder name");
              if (name) addFolder.mutate(name);
            }}
          >
            <FolderPlus />
          </Button>
        </div>
        {[
          ["all", "All decks"],
          ["root", "Unfiled"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFolder(id as "all")}
            className={cn(
              "rounded px-2 py-1 text-left text-sm hover:bg-accent",
              folder === id && "bg-accent",
            )}
          >
            {label}
          </button>
        ))}
        {folderList.map((f) => (
          <div
            key={f.id}
            className={cn("group flex items-center rounded hover:bg-accent", folder === f.id && "bg-accent")}
          >
            <button
              type="button"
              onClick={() => setFolder(f.id)}
              className="flex flex-1 items-center gap-1.5 px-2 py-1 text-left text-sm"
            >
              <Folder className="size-3.5" /> {f.name}
            </button>
            <button
              type="button"
              aria-label={`Delete folder ${f.name}`}
              className="px-1.5 opacity-0 group-hover:opacity-100"
              onClick={() =>
                confirm(`Delete folder "${f.name}"? Decks move to Unfiled.`) && removeFolder.mutate(f.id)
              }
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
        <div className="my-2 h-px bg-border" />
        <button
          type="button"
          onClick={() => setFolder("packages")}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-accent",
            folder === "packages" && "bg-accent",
          )}
        >
          <Package className="size-3.5" /> Card packages
        </button>
      </aside>

      <main className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-semibold">
            {folder === "packages" ? "Card packages" : "Decks"}
          </h1>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search decks, commanders, tags"
              className="w-64 pl-8"
              aria-label="Search decks"
            />
          </div>
          <Select
            aria-label="Format filter"
            value={format}
            onValueChange={setFormat}
            options={[
              { value: "any", label: "Any format" },
              ...FORMATS.map((f) => ({ value: f.id, label: f.name })),
            ]}
            className="w-40"
          />
          <Select
            aria-label="Bracket filter"
            value={bracket}
            onValueChange={setBracket}
            options={[
              { value: "any", label: "Any bracket" },
              ...[1, 2, 3, 4, 5].map((b) => ({ value: String(b), label: `Bracket ${b}` })),
            ]}
            className="w-36"
          />
          <fieldset className="flex items-center gap-0.5" aria-label="Colour filter">
            {COLOR_FILTERS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={colors.includes(c)}
                aria-label={`Filter ${c}`}
                onClick={() => setColors((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}
                className={cn(
                  "rounded-full p-0.5",
                  colors.includes(c) ? "ring-2 ring-primary" : "opacity-50 hover:opacity-100",
                )}
              >
                <ColorPips colors={[c]} size={18} />
              </button>
            ))}
          </fieldset>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New {folder === "packages" ? "package" : "deck"}
          </Button>
        </div>

        {decks.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
            <p className="text-lg font-medium">
              {(decks.data?.decks.length ?? 0) === 0 ? "No decks yet" : "No decks match these filters"}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Create a deck from scratch, import a list from Moxfield, Archidekt, Arena or MTGO, or ask the
              assistant to build one from a brief.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Create a deck
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {filtered.map((d) => (
              <li key={d.deck.id} className="group relative overflow-hidden rounded-lg border bg-card">
                <Link href={`/decks/${d.deck.id}`} className="block">
                  <div className="relative h-28 bg-muted">
                    {d.cover && (
                      // biome-ignore lint/performance/noImgElement: Scryfall art crop, shown as provided
                      <img src={d.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-medium">{d.deck.name}</h2>
                      <span className="ml-auto">
                        <ColorPips colors={maskToColors(d.identity)} />
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.commanders.join(" & ") || "No commander"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="muted">
                        {FORMATS.find((f) => f.id === d.deck.format)?.name ?? d.deck.format}
                      </Badge>
                      <Badge variant="muted">{d.count} cards</Badge>
                      {d.deck.targetBracket && <Badge variant="outline">B{d.deck.targetBracket}</Badge>}
                      <span className="ml-auto text-muted-foreground">{formatPrice(d.priceEur, "eur")}</span>
                    </div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Actions for ${d.deck.name}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => cloneDeck.mutate(d.deck.id)}>
                      <Copy /> Clone
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Folder /> Move to folder
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onSelect={() => patchDeck.mutate({ id: d.deck.id, patch: { folderId: null } })}
                        >
                          Unfiled
                        </DropdownMenuItem>
                        {folderList.map((f) => (
                          <DropdownMenuItem
                            key={f.id}
                            onSelect={() => patchDeck.mutate({ id: d.deck.id, patch: { folderId: f.id } })}
                          >
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      onSelect={() =>
                        patchDeck.mutate({ id: d.deck.id, patch: { isPackage: !d.deck.isPackage } })
                      }
                    >
                      <Package /> {d.deck.isPackage ? "Convert to deck" : "Convert to package"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => confirm(`Delete "${d.deck.name}"?`) && removeDeck.mutate(d.deck.id)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </main>
      <CreateDeckDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        folderId={folder !== "all" && folder !== "root" && folder !== "packages" ? folder : null}
        isPackage={folder === "packages"}
      />
    </div>
  );
}

function CreateDeckDialog({
  open,
  onOpenChange,
  folderId,
  isPackage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folderId: string | null;
  isPackage: boolean;
}) {
  const router = useRouter();
  const [format, setFormat] = useState("commander");
  const [importText, setImportText] = useState("");
  const create = useMutation({
    mutationFn: async (name: string) => {
      const r = await api<{ deck: { id: string } }>("/api/decks", {
        method: "POST",
        json: { name, format, folderId, isPackage },
      });
      if (importText.trim()) {
        const imp = await api<{ report: { imported: number; unresolved: unknown[] } }>(
          `/api/decks/${r.deck.id}/import`,
          { method: "POST", json: { text: importText } },
        );
        if (imp.report.unresolved.length)
          toast.warning(
            `${imp.report.unresolved.length} lines could not be resolved; see the import report in the deck.`,
          );
      }
      return r;
    },
    onSuccess: (r) => {
      onOpenChange(false);
      router.push(`/decks/${r.deck.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isPackage ? "New card package" : "New deck"}
        description="Optionally paste a list to import (text, Arena, MTGO, Moxfield, Archidekt or CSV)."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(String(new FormData(e.currentTarget).get("name")));
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-name">Name</Label>
            <Input
              id="deck-name"
              name="name"
              required
              autoFocus
              defaultValue={isPackage ? "New package" : "New deck"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <Select
              aria-label="Format"
              value={format}
              onValueChange={setFormat}
              options={FORMATS.map((f) => ({ value: f.id, label: f.name }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-import">Import list (optional)</Label>
            <textarea
              id="deck-import"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"1 Sol Ring (C21) 263\n1 Arcane Signet\n…"}
              className="min-h-32 rounded-md border bg-transparent p-2 font-mono text-xs"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
