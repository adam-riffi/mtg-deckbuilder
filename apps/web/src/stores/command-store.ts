import { create } from "zustand";

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

/** Pages register context commands (e.g. deck editor actions) that the global palette shows. */
export const useCommandStore = create<{
  commands: PaletteCommand[];
  setCommands: (c: PaletteCommand[]) => void;
}>((set) => ({
  commands: [],
  setCommands: (commands) => set({ commands }),
}));
