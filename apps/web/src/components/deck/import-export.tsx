"use client";

import { EXPORT_FORMATS, type ExportFormat } from "@mtg/mtg/io";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Select, Textarea } from "@/components/ui/primitives";
import { api, type DeckPayload } from "@/lib/api";

export interface ImportReport {
  format: string;
  imported: number;
  lines: number;
  unresolved: { lineNo: number; raw: string; name: string; suggestions: string[] }[];
  errors: { lineNo: number; raw: string; message: string }[];
}

export function ImportDialog({
  deckId,
  open,
  onOpenChange,
  onImported,
}: {
  deckId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: (d: DeckPayload) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      const r = await api<DeckPayload & { report: ImportReport }>(`/api/decks/${deckId}/import`, {
        method: "POST",
        json: { text, mode },
      });
      onImported({ deck: r.deck, entries: r.entries });
      setReport(r.report);
      toast.success(`Imported ${r.report.imported} cards`);
      if (!r.report.unresolved.length && !r.report.errors.length) onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReport(null);
      }}
    >
      <DialogContent
        title="Import cards"
        description="Plain text, Arena, MTGO, Moxfield, Archidekt or CSV. Set codes, foil markers (*F*) and categories ([Ramp]) are kept."
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-56 font-mono text-xs"
          placeholder={
            "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring (C21) 263\n1x Cultivate [Ramp]"
          }
          aria-label="Decklist"
        />
        <div className="flex items-center gap-2">
          <Select
            aria-label="Import mode"
            value={mode}
            onValueChange={(v) => setMode(v as "append")}
            options={[
              { value: "append", label: "Add to deck" },
              { value: "replace", label: "Replace deck contents" },
            ]}
          />
          <Button className="ml-auto" onClick={submit} disabled={pending || !text.trim()}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </div>
        {report && (report.unresolved.length > 0 || report.errors.length > 0) && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm" role="status">
            <p className="font-medium">
              Imported {report.imported} cards from {report.lines} lines ({report.format}).{" "}
              {report.unresolved.length + report.errors.length} lines need attention:
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {report.errors.map((e) => (
                <li key={`e${e.lineNo}`}>
                  Line {e.lineNo}: <code>{e.raw}</code> — {e.message}
                </li>
              ))}
              {report.unresolved.map((u) => (
                <li key={`u${u.lineNo}`}>
                  Line {u.lineNo}: <code>{u.raw}</code> — not found
                  {u.suggestions.length ? `. Did you mean ${u.suggestions.join(", ")}?` : "."}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const LABELS: Record<ExportFormat, string> = {
  text: "Plain text",
  arena: "MTG Arena",
  mtgo: "MTGO",
  moxfield: "Moxfield",
  archidekt: "Archidekt",
  csv: "CSV",
};

export function ExportDialog({
  deckId,
  open,
  onOpenChange,
  onImage,
}: {
  deckId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImage: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("text");
  const { data } = useQuery({
    queryKey: ["export", deckId, format],
    queryFn: () => api<string>(`/api/decks/${deckId}/export?format=${format}`),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Export deck">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Export format"
            value={format}
            onValueChange={(v) => setFormat(v as ExportFormat)}
            options={EXPORT_FORMATS.map((f) => ({ value: f, label: LABELS[f] }))}
          />
          <Button
            variant="outline"
            className="ml-auto"
            onClick={async () => {
              await navigator.clipboard.writeText(data ?? "");
              toast.success("Copied to clipboard");
            }}
          >
            <Copy /> Copy
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/decks/${deckId}/export?format=${format}&download=1`}>
              <Download /> Download
            </a>
          </Button>
          <Button variant="outline" onClick={onImage}>
            PNG image
          </Button>
        </div>
        <Textarea
          readOnly
          value={data ?? ""}
          className="min-h-72 font-mono text-xs"
          aria-label="Exported decklist"
        />
      </DialogContent>
    </Dialog>
  );
}
