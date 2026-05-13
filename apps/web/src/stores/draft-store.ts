import { create } from "zustand";

export type DraftStatus = "idle" | "streaming" | "complete" | "aborted" | "errored";

interface DraftStore {
  status: DraftStatus;
  text: string;
  draftId: string | null;
  modelId: string | null;
  degradedTo: string | null;
  abort: (() => void) | null;

  setStatus: (s: DraftStatus) => void;
  appendText: (t: string) => void;
  setText: (t: string) => void;
  reset: () => void;
  setAbort: (fn: () => void) => void;
  setDraftId: (id: string) => void;
  setModel: (id: string) => void;
  setDegradedTo: (id: string) => void;
}

export const useDraftStore = create<DraftStore>((set) => ({
  status: "idle",
  text: "",
  draftId: null,
  modelId: null,
  degradedTo: null,
  abort: null,

  setStatus: (status) => set({ status }),
  appendText: (t) => set((s) => ({ text: s.text + t })),
  setText: (t) => set({ text: t }),
  reset: () =>
    set({ status: "idle", text: "", draftId: null, modelId: null, degradedTo: null, abort: null }),
  setAbort: (fn) => set({ abort: fn }),
  setDraftId: (draftId) => set({ draftId }),
  setModel: (modelId) => set({ modelId }),
  setDegradedTo: (degradedTo) => set({ degradedTo }),
}));
