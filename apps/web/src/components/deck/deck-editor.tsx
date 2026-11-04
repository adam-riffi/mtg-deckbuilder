"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  bracketConfigSchema,
  type Card,
  computeStats,
  type DeckEntry,
  type DeckOp,
  deckColorIdentity,
  estimateBracket,
  getFormat,
  suggestCategories,
  validateDeck,
  type Zone,
} from "@mtg/mtg";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookText,
  Bot,
  Dices,
  Download,
  History,
  LayoutGrid,
  Package,
  Plus,
  Redo2,
  Rows3,
  Search,
  Sparkles,
  Table2,
  Tags,
  Undo2,
  Upload,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CardDetailDialog } from "@/components/card/card-detail";
import { CardImage } from "@/components/card/card-image";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { api, type CardHit } from "@/lib/api";
import { useChangeSets } from "@/lib/use-change-sets";
import { useCollectionOverlay } from "@/lib/use-collection";
import { rememberCard, useDeck } from "@/lib/use-deck";
import { cn } from "@/lib/utils";
import { useCommandStore } from "@/stores/command-store";
import { type GroupBy, type SortBy, useEditor, type ViewMode } from "@/stores/editor-store";
import { BulkBar } from "./bulk-bar";
import { CategoryDialog } from "./category-dialog";
import { DeckHeader } from "./deck-header";
import { DeckViews } from "./deck-views";
import { EditorActionsContext, moveOps, qtyOps, removeOps } from "./entry-actions";
import { exportDeckImage } from "./export-image";
import { HistoryPanel } from "./history-panel";
import { ExportDialog, ImportDialog } from "./import-export";
import { PackageDialog, TemplateDialog } from "./packages";
import { PlaytestPanel } from "./playtest/playtest-panel";
import { PrimerPanel } from "./primer-panel";
import { PrintingPicker } from "./printing-picker";
import { SearchPanel } from "./search-panel";
import { StatsPanel } from "./stats-panel";

const VIEWS: { id: ViewMode; label: string; icon: typeof Rows3; key: string }[] = [
  { id: "stacks", label: "Stacks", icon: Rows3, key: "1" },
  { id: "grid", label: "Grid", icon: LayoutGrid, key: "2" },
  { id: "text", label: "Text", icon: BookText, key: "3" },
  { id: "table", label: "Table", icon: Table2, key: "4" },
];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function DeckEditor({ deckId }: { deckId: string }) {
  const deck = useDeck(deckId);
  const ed = useEditor();
  const [tab, setTab] = useState("deck");
  const [catEntries, setCatEntries] = useState<DeckEntry[] | null>(null);
  const [printingEntry, setPrintingEntry] = useState<DeckEntry | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [dragging, setDragging] = useState<{
    name: string;
    image: CardHit["image"];
    faceImages: CardHit["faceImages"];
  } | null>(null);
  const changeSets = useChangeSets(deckId);
  const collection = useCollectionOverlay(deckId);

  const entries = deck.data?.entries ?? [];
  const meta = deck.data?.deck;
  const format = meta?.format ?? "commander";
  const currency = ed.currency;

  const legality = useMemo(() => validateDeck(entries, format), [entries, format]);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ brackets: unknown }>("/api/settings"),
    staleTime: 60_000,
  });
  const bracketConfig = useMemo(
    () => bracketConfigSchema.safeParse(settings.data?.brackets).data,
    [settings.data],
  );
  const bracket = useMemo(
    () => (getFormat(format).commander ? estimateBracket(entries, { config: bracketConfig }) : null),
    [entries, format, bracketConfig],
  );
  const stats = useMemo(() => computeStats(entries, { format, currency }), [entries, format, currency]);
  const identity = deckColorIdentity(entries).join("").toLowerCase() || "c";
  const knownCategories = useMemo(() => [...new Set(entries.flatMap((e) => e.categories))].sort(), [entries]);
  const categoryOrder = useMemo(() => meta?.categoryOrder.map((c) => c.name) ?? [], [meta]);

  const apply = useCallback(
    (ops: DeckOp[], summary?: string) => ops.length && deck.apply(ops, summary),
    [deck],
  );

  const addCard = useCallback(
    (card: Card, zone: Zone = "mainboard", category?: string) => {
      rememberCard(card);
      const cats = category ? [category] : suggestCategories(card).slice(0, 1);
      apply([{ op: "add", oracleId: card.id, qty: 1, zone, categories: cats }]);
      toast.success(`Added ${card.name}`, { duration: 1500 });
    },
    [apply],
  );

  const selected = useMemo(() => entries.filter((e) => ed.selection.includes(e.id)), [entries, ed.selection]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) deck.redo();
        else deck.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y" && !isTyping(e.target)) {
        e.preventDefault();
        deck.redo();
        return;
      }
      if (isTyping(e.target) || mod || e.altKey) return;
      const sel = useEditor.getState().selection;
      const selEntries = entries.filter((x) => sel.includes(x.id));
      switch (e.key) {
        case "/":
        case "a":
          e.preventDefault();
          ed.toggleSearch(true);
          break;
        case "c":
          ed.toggleChat();
          break;
        case "Escape":
          ed.clearSelection();
          break;
        case "Delete":
        case "Backspace":
          if (selEntries.length) {
            apply(removeOps(selEntries));
            ed.clearSelection();
          }
          break;
        case "+":
        case "=":
          if (selEntries.length) apply(qtyOps(selEntries, 1));
          break;
        case "-":
          if (selEntries.length) apply(qtyOps(selEntries, -1));
          break;
        case "s":
          if (selEntries.length) apply(moveOps(selEntries, "sideboard"));
          break;
        case "m":
          if (selEntries.length) apply(moveOps(selEntries, "maybeboard"));
          break;
        default: {
          const v = VIEWS.find((x) => x.key === e.key);
          if (v) {
            ed.setView(v.id);
            setTab("deck");
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck, entries, ed, apply]);

  // Palette commands for this page
  const setCommands = useCommandStore((s) => s.setCommands);
  useEffect(() => {
    setCommands([
      { id: "add", label: "Add cards…", shortcut: "A", run: () => ed.toggleSearch(true) },
      { id: "undo", label: "Undo", shortcut: "Ctrl+Z", run: () => deck.undo() },
      { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", run: () => deck.redo() },
      { id: "chat", label: "Toggle AI assistant", shortcut: "C", run: () => ed.toggleChat() },
      { id: "import", label: "Import cards…", run: () => setImportOpen(true) },
      { id: "export", label: "Export deck…", run: () => setExportOpen(true) },
      { id: "stats", label: "Show statistics", run: () => setTab("stats") },
      { id: "history", label: "Show history and versions", run: () => setTab("history") },
      { id: "primer", label: "Edit primer", run: () => setTab("primer") },
      { id: "playtest", label: "Playtest", run: () => setTab("playtest") },
      ...VIEWS.map((v) => ({
        id: `view-${v.id}`,
        label: `View: ${v.label}`,
        shortcut: v.key,
        run: () => {
          ed.setView(v.id);
          setTab("deck");
        },
      })),
      { id: "cheapest", label: `Use cheapest printings (${currency.toUpperCase()})`, run: () => cheapest() },
      { id: "autocat", label: "Auto-categorise uncategorised cards", run: () => autoCategorise() },
    ]);
    return () => setCommands([]);
  });

  async function cheapest() {
    const r = await api<{ changed: number } & NonNullable<typeof deck.data>>(
      `/api/decks/${deckId}/cheapest`,
      { method: "POST", json: { currency } },
    );
    deck.setData({ deck: r.deck, entries: r.entries });
    toast.success(
      r.changed
        ? `Switched ${r.changed} cards to their cheapest printing`
        : "Already using the cheapest printings",
    );
  }

  function autoCategorise() {
    const ops: DeckOp[] = entries
      .filter((e) => e.categories.length === 0)
      .map(
        (e): DeckOp => ({
          op: "set_categories",
          oracleId: e.cardId,
          zone: e.zone,
          categories: suggestCategories(e.card),
        }),
      )
      .filter((o) => o.op === "set_categories" && o.categories.length > 0);
    if (!ops.length) return toast("Nothing to categorise");
    apply(ops, `Auto-categorised ${ops.length} cards`);
  }

  // Drag and drop
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as
      | { kind: "entry"; entry: DeckEntry }
      | { kind: "search"; hit: CardHit }
      | undefined;
    if (d?.kind === "entry")
      setDragging({
        name: d.entry.card.name,
        image: d.entry.printing?.imageUris ?? null,
        faceImages: d.entry.printing?.faceImageUris ?? [],
      });
    if (d?.kind === "search")
      setDragging({ name: d.hit.card.name, image: d.hit.image, faceImages: d.hit.faceImages });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const d = e.active.data.current as
      | { kind: "entry"; entry: DeckEntry }
      | { kind: "search"; hit: CardHit }
      | undefined;
    const target = e.over?.data.current as { zone: Zone; category?: string | null } | undefined;
    if (!d || !target) return;
    if (d.kind === "search") return addCard(d.hit.card, target.zone, target.category ?? undefined);
    const sel = useEditor.getState().selection;
    const moving = sel.includes(d.entry.id) ? entries.filter((x) => sel.includes(x.id)) : [d.entry];
    const ops: DeckOp[] = [];
    for (const m of moving) {
      if (m.zone !== target.zone) ops.push({ op: "move", oracleId: m.cardId, from: m.zone, to: target.zone });
      if (target.category && m.categories[0] !== target.category) {
        ops.push({
          op: "set_categories",
          oracleId: m.cardId,
          zone: target.zone,
          categories: [target.category, ...m.categories.filter((c) => c !== target.category)],
        });
      }
    }
    apply(ops);
  };

  const actions = useMemo(
    () => ({
      apply,
      openDetail: (id: string) => ed.openDetail(id),
      editCategories: setCatEntries,
      pickPrinting: setPrintingEntry,
      categories: knownCategories,
      missing: (id: string) => (collection.enabled ? (collection.byEntry.get(id)?.missing ?? null) : null),
    }),
    [apply, ed, knownCategories, collection],
  );

  if (deck.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-[60vh]" />
      </div>
    );
  }
  if (deck.error || !meta)
    return <p className="p-6 text-destructive">Could not load deck: {deck.error?.message}</p>;

  const detailEntry = entries.find((e) => e.cardId === ed.detailCardId);

  return (
    <EditorActionsContext.Provider value={actions}>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="flex h-[calc(100vh-3rem)] flex-col">
          <DeckHeader
            name={meta.name}
            format={format}
            entries={entries}
            legality={legality}
            bracket={bracket}
            targetBracket={meta.targetBracket}
            price={stats.price.total}
            currency={currency}
            onRename={(name) => deck.patchMeta({ name })}
            onFormat={(f) => deck.patchMeta({ format: f })}
            onTargetBracket={(b) => deck.patchMeta({ targetBracket: b })}
          />
          <div className="flex min-h-0 flex-1">
            {ed.chatOpen && (
              <aside className="flex w-[24rem] shrink-0 flex-col border-r" aria-label="AI assistant">
                <ChatPanel
                  deckId={deckId}
                  changeSets={changeSets}
                  onClose={() => ed.toggleChat(false)}
                  autoApply={meta.autoApplyAi}
                  onAutoApply={(v) => deck.patchMeta({ autoApplyAi: v })}
                  onDeckChanged={(d) => deck.setData(d)}
                />
              </aside>
            )}
            <Tabs value={tab} onValueChange={setTab} className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
                {!ed.chatOpen && (
                  <Tooltip content="AI assistant (C)">
                    <Button variant="outline" size="sm" onClick={() => ed.toggleChat(true)}>
                      <Bot /> Assistant
                    </Button>
                  </Tooltip>
                )}
                <TabsList>
                  <TabsTrigger value="deck">Deck</TabsTrigger>
                  <TabsTrigger value="stats">
                    <BarChart3 className="mr-1 inline size-3.5" />
                    Stats
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="mr-1 inline size-3.5" />
                    History
                  </TabsTrigger>
                  <TabsTrigger value="primer">Primer</TabsTrigger>
                  <TabsTrigger value="playtest">
                    <Dices className="mr-1 inline size-3.5" />
                    Playtest
                  </TabsTrigger>
                </TabsList>
                {tab === "deck" && (
                  <>
                    <div
                      className="flex items-center rounded-md border p-0.5"
                      role="radiogroup"
                      aria-label="View"
                    >
                      {VIEWS.map((v) => (
                        <Tooltip key={v.id} content={`${v.label} (${v.key})`}>
                          {/* biome-ignore lint/a11y/useSemanticElements: segmented control styled as buttons */}
                          <button
                            type="button"
                            role="radio"
                            aria-checked={ed.view === v.id}
                            aria-label={v.label}
                            onClick={() => ed.setView(v.id)}
                            className={cn(
                              "rounded p-1 text-muted-foreground hover:text-foreground",
                              ed.view === v.id && "bg-accent text-foreground",
                            )}
                          >
                            <v.icon className="size-4" />
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                    <Select
                      aria-label="Group by"
                      value={ed.groupBy}
                      onValueChange={(v) => ed.setGroupBy(v as GroupBy)}
                      className="h-8 w-36 text-xs"
                      options={[
                        { value: "type", label: "Group: Type" },
                        { value: "category", label: "Group: Category" },
                        { value: "mv", label: "Group: Mana value" },
                        { value: "color", label: "Group: Colour" },
                        { value: "rarity", label: "Group: Rarity" },
                        { value: "tag", label: "Group: Tag" },
                        { value: "none", label: "No grouping" },
                      ]}
                    />
                    <Select
                      aria-label="Sort by"
                      value={ed.sortBy}
                      onValueChange={(v) => ed.setSortBy(v as SortBy)}
                      className="h-8 w-32 text-xs"
                      options={[
                        { value: "mv", label: "Sort: MV" },
                        { value: "name", label: "Sort: Name" },
                        { value: "price", label: "Sort: Price" },
                        { value: "type", label: "Sort: Type" },
                        { value: "rarity", label: "Sort: Rarity" },
                      ]}
                    />
                  </>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Select
                    aria-label="Currency"
                    value={currency}
                    onValueChange={(v) => ed.setCurrency(v as "eur")}
                    options={[
                      { value: "eur", label: "EUR" },
                      { value: "usd", label: "USD" },
                    ]}
                    className="h-8 w-20 text-xs"
                  />
                  <Tooltip content="Undo (Ctrl+Z)">
                    <Button variant="ghost" size="icon-sm" onClick={deck.undo} aria-label="Undo">
                      <Undo2 />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Redo (Ctrl+Shift+Z)">
                    <Button variant="ghost" size="icon-sm" onClick={deck.redo} aria-label="Redo">
                      <Redo2 />
                    </Button>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        More
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                        <Upload /> Import…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setExportOpen(true)}>
                        <Download /> Export…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={cheapest}>
                        <WalletCards /> Cheapest printings ({currency.toUpperCase()})
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={autoCategorise}>
                        <Sparkles /> Auto-categorise
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPackagesOpen(true)}>
                        <Package /> Add card package…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>
                        <Tags /> Category template…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="sm" onClick={() => ed.toggleSearch()} aria-expanded={ed.searchOpen}>
                    <Plus /> Add cards{" "}
                    <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">A</Kbd>
                  </Button>
                </div>
              </div>
              <TabsContent
                value="deck"
                className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden"
              >
                {collection.enabled && collection.missing > 0 && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Collection: {collection.missing} cards missing · cost to complete {collection.costLabel}
                  </p>
                )}
                {entries.length === 0 && changeSets.ghostAdds.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
                    <p className="text-lg font-medium">This deck is empty</p>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Search for cards (press A), import a list, or ask the assistant for a full build from a
                      short brief.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => ed.toggleSearch(true)}>
                        <Search /> Search cards
                      </Button>
                      <Button variant="outline" onClick={() => setImportOpen(true)}>
                        <Upload /> Import
                      </Button>
                      <Button variant="outline" onClick={() => ed.toggleChat(true)}>
                        <Bot /> Ask the assistant
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DeckViews
                    entries={entries}
                    ghostAdds={changeSets.ghostAdds}
                    ghostRemoves={changeSets.ghostRemoves}
                    categoryOrder={categoryOrder}
                  />
                )}
              </TabsContent>
              <TabsContent
                value="stats"
                className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden"
              >
                <StatsPanel
                  deckId={deckId}
                  entries={entries}
                  stats={stats}
                  format={format}
                  currency={currency}
                  legality={legality}
                  bracket={bracket}
                />
              </TabsContent>
              <TabsContent
                value="history"
                className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden"
              >
                <HistoryPanel deckId={deckId} onRestored={(d) => deck.setData(d)} />
              </TabsContent>
              <TabsContent
                value="primer"
                className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden"
              >
                <PrimerPanel
                  primer={meta.primer}
                  entries={entries}
                  onSave={(primer) => deck.patchMeta({ primer })}
                />
              </TabsContent>
              <TabsContent
                value="playtest"
                className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                {tab === "playtest" && <PlaytestPanel entries={entries} format={format} />}
              </TabsContent>
            </Tabs>
            {ed.searchOpen && (
              <aside className="flex w-[26rem] shrink-0 flex-col border-l" aria-label="Card search">
                <SearchPanel
                  onAdd={addCard}
                  onOpen={(id) => ed.openDetail(id)}
                  onClose={() => ed.toggleSearch(false)}
                  identityHint={
                    getFormat(format).commander && entries.some((e) => e.zone === "commander")
                      ? identity
                      : undefined
                  }
                />
              </aside>
            )}
          </div>
          {selected.length > 0 && <BulkBar entries={selected} onCategories={() => setCatEntries(selected)} />}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <CardImage
              image={dragging.image}
              faceImages={dragging.faceImages}
              name={dragging.name}
              className="w-36 rotate-2 opacity-90 shadow-2xl"
              lazy={false}
            />
          )}
        </DragOverlay>
      </DndContext>
      <CardDetailDialog
        id={ed.detailCardId}
        onClose={() => ed.openDetail(null)}
        currentPrintingId={detailEntry?.printingId}
        onPickPrinting={
          detailEntry
            ? (p) =>
                apply([
                  {
                    op: "set_printing",
                    oracleId: detailEntry.cardId,
                    zone: detailEntry.zone,
                    printingId: p.id,
                  },
                ])
            : undefined
        }
      />
      <CategoryDialog
        entries={catEntries}
        onClose={() => setCatEntries(null)}
        apply={apply}
        known={knownCategories}
      />
      <PrintingPicker
        entry={printingEntry}
        onClose={() => setPrintingEntry(null)}
        apply={apply}
        currency={currency}
      />
      <PackageDialog open={packagesOpen} onOpenChange={setPackagesOpen} deckId={deckId} apply={apply} />
      <TemplateDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onApply={(cats) => deck.patchMeta({ categoryOrder: cats.map((name) => ({ name })) })}
      />
      <ImportDialog
        deckId={deckId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(d) => deck.setData(d)}
      />
      <ExportDialog
        deckId={deckId}
        open={exportOpen}
        onOpenChange={setExportOpen}
        onImage={() => exportDeckImage(meta.name, entries)}
      />
    </EditorActionsContext.Provider>
  );
}
