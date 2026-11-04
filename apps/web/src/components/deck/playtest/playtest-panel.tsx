"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type DeckEntry,
  getFormat,
  newGame,
  type PtAction,
  type PtCard,
  type PtState,
  type PtZone,
  playtestReducer,
} from "@mtg/mtg";
import { Dices, Eye, Heart, Minus, Plus, RotateCcw, Shuffle, SkipForward, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  Input,
  Kbd,
} from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const ZONE_LABEL: Record<PtZone, string> = {
  library: "Library",
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
};

function buildGame(entries: DeckEntry[], format: string): PtState {
  const toCards = (list: DeckEntry[]) =>
    list.flatMap((e) =>
      Array.from({ length: e.qty }, (_, i) => ({
        uid: `${e.id}#${i}`,
        cardId: e.cardId,
        name: e.card.name,
        image: e.printing?.imageUris?.normal ?? e.printing?.faceImageUris[0]?.normal ?? null,
        backImage: e.printing?.faceImageUris[1]?.normal ?? null,
      })),
    );
  const f = getFormat(format);
  return newGame(
    toCards(entries.filter((e) => e.zone === "mainboard")),
    toCards(entries.filter((e) => e.zone === "commander" || e.zone === "companion")),
    { life: f.commander ? (f.id === "duel" || f.id === "brawl" || f.id === "standardbrawl" ? 25 : 40) : 20 },
  );
}

function PtCardView({
  c,
  zone,
  dispatch,
  small,
}: {
  c: PtCard;
  zone: PtZone;
  dispatch: (a: PtAction) => void;
  small?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.uid, data: { zone } });
  const src = c.flipped && c.backImage ? c.backImage : c.image;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* biome-ignore lint/a11y/useSemanticElements: draggable card needs a div (dnd-kit) */}
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          aria-label={`${c.name}${c.tapped ? " (tapped)" : ""}`}
          onDoubleClick={() =>
            zone === "battlefield"
              ? dispatch({ t: "tap", uid: c.uid })
              : dispatch({ t: "move", uid: c.uid, to: "battlefield" })
          }
          onKeyDown={(e) => {
            if (e.key === "t") dispatch({ t: "tap", uid: c.uid });
            if (e.key === "Enter")
              dispatch({ t: "move", uid: c.uid, to: zone === "battlefield" ? "graveyard" : "battlefield" });
          }}
          className={cn(
            "relative shrink-0 transition-transform",
            small ? "w-20" : "w-28",
            c.tapped && "rotate-90",
            isDragging && "opacity-40",
          )}
        >
          {src ? (
            // biome-ignore lint/performance/noImgElement: Scryfall images, unaltered
            <img src={src} alt={c.name} className="card-img w-full" draggable={false} />
          ) : (
            <div className="card-img flex w-full items-center justify-center bg-muted p-1 text-center text-[10px]">
              {c.name}
            </div>
          )}
          {Object.entries(c.counters).map(([k, v]) => (
            <span
              key={k}
              className="absolute bottom-1 left-1 rounded bg-black/80 px-1 text-[10px] font-bold text-white"
            >
              {k} ×{v}
            </span>
          ))}
          {c.token && (
            <span className="absolute top-1 right-1 rounded bg-black/80 px-1 text-[9px] text-white">
              TOKEN
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => dispatch({ t: "tap", uid: c.uid })}>
          {c.tapped ? "Untap" : "Tap"} (T)
        </ContextMenuItem>
        {c.backImage && (
          <ContextMenuItem onSelect={() => dispatch({ t: "flip", uid: c.uid })}>
            Transform / flip
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => dispatch({ t: "counter", uid: c.uid, kind: "+1/+1", delta: 1 })}>
          +1/+1 counter
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => dispatch({ t: "counter", uid: c.uid, kind: "+1/+1", delta: -1 })}>
          Remove +1/+1 counter
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => dispatch({ t: "counter", uid: c.uid, kind: "loyalty", delta: 1 })}>
          +1 loyalty
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => dispatch({ t: "counter", uid: c.uid, kind: "loyalty", delta: -1 })}>
          −1 loyalty
        </ContextMenuItem>
        <ContextMenuSeparator />
        {(["battlefield", "hand", "graveyard", "exile", "command"] as PtZone[])
          .filter((z) => z !== zone)
          .map((z) => (
            <ContextMenuItem key={z} onSelect={() => dispatch({ t: "move", uid: c.uid, to: z })}>
              Move to {ZONE_LABEL[z]}
            </ContextMenuItem>
          ))}
        <ContextMenuItem onSelect={() => dispatch({ t: "move", uid: c.uid, to: "library", position: "top" })}>
          Library (top)
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => dispatch({ t: "move", uid: c.uid, to: "library", position: "bottom" })}
        >
          Library (bottom)
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ZoneBox({
  zone,
  cards,
  dispatch,
  className,
  children,
  small,
}: {
  zone: PtZone;
  cards: PtCard[];
  dispatch: (a: PtAction) => void;
  className?: string;
  children?: React.ReactNode;
  small?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `pt:${zone}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={ZONE_LABEL[zone]}
      className={cn("rounded-lg border p-2", isOver && "border-primary bg-primary/5", className)}
    >
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {ZONE_LABEL[zone]} ({cards.length})
      </h3>
      {children ?? (
        <div className="flex flex-wrap gap-2">
          {cards.map((c) => (
            <PtCardView key={c.uid} c={c} zone={zone} dispatch={dispatch} small={small} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Goldfish playtester: draw, London mulligan, shuffle, scry, tap, counters, tokens, life and turns. */
export function PlaytestPanel({ entries, format }: { entries: DeckEntry[]; format: string }) {
  const [history, setHistory] = useState<PtState[]>(() => [buildGame(entries, format)]);
  const state = history[history.length - 1]!;
  const dispatch = useCallback(
    (a: PtAction) => setHistory((h) => [...h.slice(-100), playtestReducer(h[h.length - 1]!, a)]),
    [],
  );
  const undo = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const restart = () => setHistory([buildGame(entries, format)]);
  const [scry, setScry] = useState<number | null>(null);
  const [tokenName, setTokenName] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") return undo();
      const k = e.key.toLowerCase();
      if (k === "d") dispatch({ t: "draw" });
      else if (k === "n") dispatch({ t: "next_turn" });
      else if (k === "u") dispatch({ t: "untap_all" });
      else if (k === "x") dispatch({ t: "shuffle" });
      else if (k === "m") dispatch({ t: "mulligan" });
      else if (k === "s") setScry(1);
      else if (k === "r") restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id ? (String(e.over.id).replace("pt:", "") as PtZone) : null;
    const from = (e.active.data.current as { zone: PtZone } | undefined)?.zone;
    if (!to || to === from) return;
    if (from === "hand" && to === "library" && state.toBottom > 0)
      dispatch({ t: "bottom", uid: String(e.active.id) });
    else dispatch({ t: "move", uid: String(e.active.id), to, position: "top" });
  };

  const scryCards = useMemo(() => (scry ? state.zones.library.slice(0, scry) : []), [scry, state]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Turn {state.turn}</span>
          <span
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
            title={`Life ${state.life}`}
          >
            <Heart className="size-4 text-destructive" />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => dispatch({ t: "life", delta: -1 })}
              aria-label="Lose 1 life"
            >
              <Minus />
            </Button>
            <span className="w-8 text-center tabular-nums">{state.life}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => dispatch({ t: "life", delta: 1 })}
              aria-label="Gain 1 life"
            >
              <Plus />
            </Button>
          </span>
          <Button size="sm" variant="outline" onClick={() => dispatch({ t: "draw" })}>
            Draw <Kbd>D</Kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => dispatch({ t: "next_turn" })}>
            <SkipForward /> Next turn <Kbd>N</Kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => dispatch({ t: "untap_all" })}>
            Untap all <Kbd>U</Kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setScry(1)}>
            <Eye /> Scry <Kbd>S</Kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => dispatch({ t: "shuffle" })}>
            <Shuffle /> Shuffle <Kbd>X</Kbd>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => dispatch({ t: "mulligan" })}
            disabled={state.turn > 1}
          >
            <Dices /> Mulligan <Kbd>M</Kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => dispatch({ t: "mill", n: 1 })}>
            Mill 1
          </Button>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (tokenName.trim()) dispatch({ t: "token", name: tokenName.trim() });
              setTokenName("");
            }}
          >
            <Input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="Token name"
              className="h-8 w-32"
              aria-label="Token name"
            />
            <Button size="sm" variant="outline" type="submit">
              Token
            </Button>
          </form>
          <Button size="sm" variant="ghost" onClick={undo} disabled={history.length <= 1}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={restart}>
            <RotateCcw /> New game <Kbd>R</Kbd>
          </Button>
        </div>
        {state.toBottom > 0 && (
          <p className="rounded-md bg-warning/15 px-3 py-1.5 text-sm text-warning" role="status">
            London mulligan: drag {state.toBottom} card{state.toBottom > 1 ? "s" : ""} from your hand onto the
            library (bottom), or right-click → Library (bottom).
          </p>
        )}
        <div className="grid flex-1 gap-2 lg:grid-cols-[1fr_14rem]">
          <ZoneBox
            zone="battlefield"
            cards={state.zones.battlefield}
            dispatch={dispatch}
            className="min-h-64"
          />
          <div className="flex flex-col gap-2">
            <ZoneBox zone="library" cards={state.zones.library} dispatch={dispatch}>
              <button
                type="button"
                onClick={() => dispatch({ t: "draw" })}
                className="card-img flex w-24 items-center justify-center rounded bg-gradient-to-br from-amber-900 to-stone-900 text-xs text-white"
                aria-label="Draw a card"
              >
                {state.zones.library.length} cards
              </button>
            </ZoneBox>
            <ZoneBox zone="command" cards={state.zones.command} dispatch={dispatch} small />
            <ZoneBox zone="graveyard" cards={state.zones.graveyard} dispatch={dispatch} small />
            <ZoneBox zone="exile" cards={state.zones.exile} dispatch={dispatch} small />
          </div>
        </div>
        <ZoneBox zone="hand" cards={state.zones.hand} dispatch={dispatch}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {state.zones.hand.map((c) =>
              state.toBottom > 0 ? (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => dispatch({ t: "bottom", uid: c.uid })}
                  title="Put on the bottom"
                  className="shrink-0"
                >
                  <PtCardView c={c} zone="hand" dispatch={dispatch} />
                </button>
              ) : (
                <PtCardView key={c.uid} c={c} zone="hand" dispatch={dispatch} />
              ),
            )}
          </div>
        </ZoneBox>
        <details className="text-xs text-muted-foreground">
          <summary>Game log</summary>
          <ol className="mt-1 max-h-32 overflow-y-auto">
            {state.log
              .slice()
              .reverse()
              .map((l, i) => (
                <li key={i}>{l}</li>
              ))}
          </ol>
        </details>
      </div>
      <Dialog open={scry !== null} onOpenChange={(o) => !o && setScry(null)}>
        <DialogContent
          title={`Scry ${scry ?? 1}`}
          description="Choose top or bottom for each card. Unassigned cards stay on top in their current order."
        >
          <ScryChooser
            cards={scryCards}
            onMore={() => setScry((n) => Math.min((n ?? 1) + 1, state.zones.library.length))}
            onDone={(top, bottom) => {
              dispatch({ t: "scry_resolve", top, bottom });
              setScry(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function ScryChooser({
  cards,
  onMore,
  onDone,
}: {
  cards: PtCard[];
  onMore: () => void;
  onDone: (top: string[], bottom: string[]) => void;
}) {
  const [choice, setChoice] = useState<Record<string, "top" | "bottom">>({});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {cards.map((c) => (
          <div key={c.uid} className="w-28 space-y-1">
            {c.image ? (
              // biome-ignore lint/performance/noImgElement: Scryfall image
              <img src={c.image} alt={c.name} className="card-img w-full" />
            ) : (
              <div className="card-img bg-muted p-1 text-xs">{c.name}</div>
            )}
            <div className="flex gap-1">
              {(["top", "bottom"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setChoice((x) => ({ ...x, [c.uid]: p }))}
                  className={cn(
                    "flex-1 rounded border px-1 text-xs",
                    choice[c.uid] === p && "bg-primary text-primary-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={onMore}>
          Look at one more
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onDone(
              cards.filter((c) => choice[c.uid] !== "bottom").map((c) => c.uid),
              cards.filter((c) => choice[c.uid] === "bottom").map((c) => c.uid),
            )
          }
        >
          Done
        </Button>
      </div>
    </div>
  );
}
