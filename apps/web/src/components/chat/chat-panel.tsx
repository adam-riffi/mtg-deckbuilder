"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Brain, Loader2, Plus, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { Children, isValidElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { CardHoverPreview } from "@/components/deck/card-preview";
import { Button } from "@/components/ui/button";
import { Select, Switch, Textarea, Tooltip } from "@/components/ui/primitives";
import { api, type DeckPayload } from "@/lib/api";
import type { ChangeSetsApi } from "@/lib/use-change-sets";
import { deckKey } from "@/lib/use-deck";
import { cn, formatCost } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { ChangeSetCard } from "./change-set-card";

interface Thread {
  id: string;
  title: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}
interface Block {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: Block[];
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}
interface ModelInfo {
  id: string;
  label: string;
  role: string;
}

const STARTERS = [
  "Build a 100-card Commander deck around my commander, bracket 3, budget €150.",
  "Analyse my mana base and curve. What should I cut?",
  "Suggest 5 upgrades under €5 each.",
  "Write a short primer for this deck.",
];

function toolLabel(b: Block): string {
  const i = b.input ?? {};
  if (b.name === "search_cards") return `search: ${String(i.query ?? "")}`;
  if (b.name === "get_cards")
    return `look up: ${[...((i.names as string[]) ?? []), ...((i.ids as string[]) ?? [])].slice(0, 4).join(", ")}`;
  if (b.name === "propose_changes")
    return `propose ${(i.changes as unknown[] | undefined)?.length ?? 0} changes`;
  return (b.name ?? "tool").replace(/_/g, " ");
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

/** Markdown with [[Card Name]] hover previews. */
function Prose({ text, unverified }: { text: string; unverified?: Set<string> }) {
  const md = text.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, n: string) => `[${n.trim()}](card:${encodeURIComponent(n.trim())})`,
  );
  return (
    <div className="prose-primer text-sm [&_p]:my-1.5">
      <ReactMarkdown
        urlTransform={(u) => u}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("card:")) {
              const name = decodeURIComponent(href.slice(5));
              return (
                <CardMention
                  name={name}
                  label={textOf(children)}
                  flagged={unverified?.has(name.toLowerCase())}
                />
              );
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
    </div>
  );
}

function CardMention({ name, label, flagged }: { name: string; label: string; flagged?: boolean }) {
  const { data } = useQuery({
    queryKey: ["mention", name.toLowerCase()],
    queryFn: () =>
      api<{ hits: { card: { id: string; name: string }; image: null; faceImages: [] }[] }>(
        "/api/cards/resolve",
        { method: "POST", json: { names: [name] } },
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const hit = data?.hits[0];
  const openDetail = useEditor((s) => s.openDetail);
  if (!hit)
    return (
      <span
        className={cn("font-medium", flagged && "text-warning underline decoration-wavy")}
        title={flagged ? "Not verified against the card database" : undefined}
      >
        {label}
      </span>
    );
  return (
    <CardHoverPreview card={hit.card} image={hit.image} faceImages={hit.faceImages}>
      <button
        type="button"
        onClick={() => openDetail(hit.card.id)}
        className="font-medium text-primary underline decoration-dotted"
      >
        {label}
      </button>
    </CardHoverPreview>
  );
}

export function ChatPanel({
  deckId,
  changeSets,
  onClose,
  autoApply,
  onAutoApply,
  onDeckChanged,
}: {
  deckId: string;
  changeSets: ChangeSetsApi;
  onClose: () => void;
  autoApply: boolean;
  onAutoApply: (v: boolean) => void;
  onDeckChanged: (d: DeckPayload) => void;
}) {
  const qc = useQueryClient();
  const currency = useEditor((s) => s.currency);
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () =>
      api<{ models: ModelInfo[]; defaults: { chat: string }; configured: boolean }>("/api/models"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const threads = useQuery({
    queryKey: ["threads", deckId],
    queryFn: () => api<{ threads: Thread[]; cost: { costUsd: number } }>(`/api/decks/${deckId}/threads`),
  });
  const [threadId, setThreadId] = useState<string | null>(null);
  const activeId = threadId ?? threads.data?.threads[0]?.id ?? null;
  const thread = threads.data?.threads.find((t) => t.id === activeId) ?? null;
  const messages = useQuery({
    queryKey: ["thread", activeId],
    queryFn: () => api<{ messages: Message[] }>(`/api/chat/threads/${activeId}`),
    enabled: !!activeId,
  });
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<{
    text: string;
    tools: { id: string; name: string; status: string }[];
    thinking: boolean;
  } | null>(null);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoApplyRef = useRef(autoApply);
  autoApplyRef.current = autoApply;

  const model = thread?.model ?? pendingModel ?? models.data?.defaults.chat ?? "claude-sonnet-5-5";

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever messages or the stream change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.data, streaming]);

  // Map propose_changes tool_use ids to their change set ids (from the following tool_result).
  const changeSetByTool = useMemo(() => {
    const m = new Map<string, string>();
    for (const msg of messages.data?.messages ?? [])
      for (const b of msg.content)
        if (b.type === "tool_result" && typeof b.content === "string") {
          try {
            const r = JSON.parse(b.content) as { change_set_id?: string };
            if (r.change_set_id && b.tool_use_id) m.set(b.tool_use_id, r.change_set_id);
          } catch {}
        }
    return m;
  }, [messages.data]);

  async function newThread(m = model) {
    const r = await api<{ thread: Thread }>(`/api/decks/${deckId}/threads`, {
      method: "POST",
      json: { model: m },
    });
    await qc.invalidateQueries({ queryKey: ["threads", deckId] });
    setThreadId(r.thread.id);
    return r.thread.id;
  }

  async function changeModel(m: string) {
    if (!activeId) return setPendingModel(m);
    await api(`/api/chat/threads/${activeId}`, { method: "PATCH", json: { model: m } });
    qc.invalidateQueries({ queryKey: ["threads", deckId] });
  }

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const id = activeId ?? (await newThread());
    setDraft("");
    setUnverified(new Set());
    setStreaming({ text: "", tools: [], thinking: false });
    // Optimistically show the user message.
    qc.setQueryData<{ messages: Message[] }>(["thread", id], (old) => ({
      messages: [
        ...(old?.messages ?? []),
        {
          id: `tmp-${Date.now()}`,
          role: "user",
          content: [{ type: "text", text }],
          model: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
        },
      ],
    }));
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`/api/chat/threads/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, currency }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as { type: string; [k: string]: unknown };
          handleEvent(ev, id);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      abortRef.current = null;
      setStreaming(null);
      qc.invalidateQueries({ queryKey: ["thread", id] });
      qc.invalidateQueries({ queryKey: ["threads", deckId] });
      changeSets.refresh();
    }
  }

  function handleEvent(ev: { type: string; [k: string]: unknown }, id: string) {
    switch (ev.type) {
      case "text":
        setStreaming((s) => s && { ...s, text: s.text + String(ev.text), thinking: false });
        break;
      case "thinking":
        setStreaming((s) => s && { ...s, thinking: true });
        break;
      case "tool":
        setStreaming((s) => {
          if (!s) return s;
          const others = s.tools.filter((t) => t.id !== ev.id);
          return {
            ...s,
            thinking: false,
            text: ev.status === "start" ? `${s.text}\n\n` : s.text,
            tools: [...others, { id: String(ev.id), name: String(ev.name), status: String(ev.status) }],
          };
        });
        break;
      case "change_set":
        changeSets.refresh();
        qc.invalidateQueries({ queryKey: ["thread", id] });
        if (autoApplyRef.current)
          void changeSets
            .acceptAll(String(ev.id))
            .then((d) => d && onDeckChanged({ deck: d.deck, entries: d.entries }));
        break;
      case "verification":
        setUnverified(new Set((ev.unverified as string[]).map((n) => n.toLowerCase())));
        if ((ev.unverified as string[]).length)
          toast.warning(`Unverified card names: ${(ev.unverified as string[]).join(", ")}`);
        break;
      case "title":
        qc.invalidateQueries({ queryKey: ["threads", deckId] });
        break;
      case "error":
        toast.error(String(ev.message));
        break;
      case "done":
        if (ev.stopReason === "refusal") toast.warning("The model declined this request.");
        qc.invalidateQueries({ queryKey: deckKey(deckId) });
        break;
    }
  }

  const visible = (messages.data?.messages ?? []).filter(
    (m) => !(m.role === "user" && m.content.every((b) => b.type === "tool_result")),
  );
  const setsById = new Map(changeSets.sets.map((s) => [s.id, s]));
  const shownSets = new Set<string>();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Bot className="size-4 text-primary" aria-hidden />
        <Select
          aria-label="Chat thread"
          value={activeId ?? "none"}
          onValueChange={(v) => setThreadId(v === "none" ? null : v)}
          options={[
            ...(threads.data?.threads ?? []).map((t) => ({ value: t.id, label: t.title })),
            ...(activeId ? [] : [{ value: "none", label: "New chat" }]),
          ]}
          className="h-7 min-w-0 flex-1 text-xs"
        />
        <Tooltip content="New chat">
          <Button size="icon-sm" variant="ghost" onClick={() => newThread()} aria-label="New chat">
            <Plus />
          </Button>
        </Tooltip>
        {activeId && (
          <Tooltip content="Delete chat">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete chat"
              onClick={async () => {
                if (!confirm("Delete this chat?")) return;
                await api(`/api/chat/threads/${activeId}`, { method: "DELETE" });
                setThreadId(null);
                qc.invalidateQueries({ queryKey: ["threads", deckId] });
              }}
            >
              <Trash2 />
            </Button>
          </Tooltip>
        )}
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close assistant">
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
        <Select
          aria-label="Model"
          value={model}
          onValueChange={changeModel}
          options={(models.data?.models ?? []).map((m) => ({ value: m.id, label: `${m.label} — ${m.role}` }))}
          className="h-7 flex-1 text-xs"
        />
        <div
          className="flex items-center gap-1 whitespace-nowrap"
          title="Apply AI proposals without review (still undoable)"
        >
          <Switch checked={autoApply} onCheckedChange={onAutoApply} aria-label="Auto-apply AI changes" />{" "}
          Auto-apply
        </div>
      </div>
      {models.data && !models.data.configured && (
        <p className="border-b bg-warning/10 px-3 py-2 text-xs text-warning">
          Set ANTHROPIC_API_KEY in .env and restart to enable the assistant.
        </p>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {visible.length === 0 && !streaming && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Ask for a full build, cuts, upgrades, mana analysis, budget or bracket tuning. Proposed edits
              appear here for review and as dashed ghost cards in the deck.
            </p>
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(s)}
                className="block w-full rounded-md border p-2 text-left text-xs hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {visible.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-6 rounded-lg bg-primary/15 px-3 py-2 text-sm whitespace-pre-wrap">
              {m.content
                .filter((b) => b.type === "text" && !b.text?.startsWith("<deck_summary>"))
                .map((b) => b.text)
                .join("\n")}
            </div>
          ) : (
            <div key={m.id} className="space-y-1.5">
              {m.content.map((b, i) => {
                if (b.type === "text" && b.text)
                  return <Prose key={i} text={b.text} unverified={unverified} />;
                if (b.type === "thinking" && b.thinking)
                  return (
                    <details key={i} className="text-xs text-muted-foreground">
                      <summary className="flex cursor-pointer items-center gap-1">
                        <Brain className="size-3" /> Reasoning summary
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap">{b.thinking}</p>
                    </details>
                  );
                if (b.type === "tool_use") {
                  const csId = changeSetByTool.get(b.id ?? "");
                  const cs = csId ? setsById.get(csId) : undefined;
                  if (cs && !shownSets.has(cs.id)) {
                    shownSets.add(cs.id);
                    return <ChangeSetCard key={i} set={cs} api={changeSets} />;
                  }
                  return (
                    <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wrench className="size-3" /> {toolLabel(b)}
                    </div>
                  );
                }
                return null;
              })}
              {m.costUsd > 0 && (
                <p
                  className="text-[10px] text-muted-foreground"
                  title={`${m.inputTokens} input, ${m.cacheReadTokens} cached, ${m.cacheWriteTokens} cache-write, ${m.outputTokens} output tokens`}
                >
                  {m.model} · {(m.inputTokens + m.cacheReadTokens + m.cacheWriteTokens).toLocaleString()} in /{" "}
                  {m.outputTokens.toLocaleString()} out · {formatCost(m.costUsd)}
                </p>
              )}
            </div>
          ),
        )}
        {streaming && (
          <div className="space-y-1.5">
            {streaming.text && <Prose text={streaming.text} />}
            {streaming.tools.map((t) => (
              <div key={t.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                {t.status === "start" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Wrench className={cn("size-3", t.status === "error" && "text-destructive")} />
                )}
                {t.name.replace(/_/g, " ")}
              </div>
            ))}
            {(streaming.thinking || (!streaming.text && streaming.tools.length === 0)) && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Thinking…
              </p>
            )}
          </div>
        )}
      </div>

      <form
        className="border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Ask the assistant… (Enter to send, Shift+Enter for a new line)"
          className="min-h-16 resize-none text-sm"
          aria-label="Message the assistant"
        />
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            Chat {formatCost(thread?.costUsd ?? 0)} · deck {formatCost(threads.data?.cost.costUsd ?? 0)}
          </span>
          {streaming ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="ml-auto"
              onClick={() => abortRef.current?.abort()}
            >
              <Square /> Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" className="ml-auto" disabled={!draft.trim()}>
              <Send /> Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
