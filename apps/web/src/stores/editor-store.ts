import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "stacks" | "text" | "grid" | "table";
export type GroupBy = "category" | "type" | "mv" | "color" | "rarity" | "tag" | "none";
export type SortBy = "name" | "mv" | "price" | "type" | "rarity";

interface EditorState {
  view: ViewMode;
  groupBy: GroupBy;
  sortBy: SortBy;
  currency: "eur" | "usd";
  chatOpen: boolean;
  searchOpen: boolean;
  /** Selected entry ids ("zone:oracleId"). */
  selection: string[];
  detailCardId: string | null;
  setView: (v: ViewMode) => void;
  setGroupBy: (g: GroupBy) => void;
  setSortBy: (s: SortBy) => void;
  setCurrency: (c: "eur" | "usd") => void;
  toggleChat: (open?: boolean) => void;
  toggleSearch: (open?: boolean) => void;
  select: (id: string, mode?: "toggle" | "only" | "add") => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  openDetail: (cardId: string | null) => void;
}

export const useEditor = create<EditorState>()(
  persist(
    (set) => ({
      view: "stacks",
      groupBy: "type",
      sortBy: "mv",
      currency: "eur",
      chatOpen: true,
      searchOpen: false,
      selection: [],
      detailCardId: null,
      setView: (view) => set({ view }),
      setGroupBy: (groupBy) => set({ groupBy }),
      setSortBy: (sortBy) => set({ sortBy }),
      setCurrency: (currency) => set({ currency }),
      toggleChat: (open) => set((s) => ({ chatOpen: open ?? !s.chatOpen })),
      toggleSearch: (open) => set((s) => ({ searchOpen: open ?? !s.searchOpen })),
      select: (id, mode = "toggle") =>
        set((s) => {
          if (mode === "only") return { selection: [id] };
          if (mode === "add")
            return { selection: s.selection.includes(id) ? s.selection : [...s.selection, id] };
          return {
            selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
          };
        }),
      setSelection: (selection) => set({ selection }),
      clearSelection: () => set({ selection: [] }),
      openDetail: (detailCardId) => set({ detailCardId }),
    }),
    {
      name: "deck-editor",
      partialize: (s) => ({
        view: s.view,
        groupBy: s.groupBy,
        sortBy: s.sortBy,
        currency: s.currency,
        chatOpen: s.chatOpen,
      }),
    },
  ),
);
