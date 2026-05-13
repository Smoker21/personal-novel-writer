import { create } from "zustand";

export type EditorStateKind =
  | { kind: "loading" }
  | { kind: "clean" }
  | { kind: "browser-only"; lastAutoSaveAt: number }
  | { kind: "save-error"; reason: string; retryCount: number };

export interface ChapterContext {
  number: number;
  title: string;
  fileTitle: string;
  baseMtime: string;
  baseContent: string;
}

interface EditorStore {
  projectHash: string | null;
  chapter: ChapterContext | null;
  state: EditorStateKind;
  charCount: number;

  setProjectHash(hash: string): void;
  setChapter(ctx: ChapterContext): void;
  setTitle(title: string): void;
  markLoading(): void;
  markClean(newMtime: string, newContent: string, newFileTitle: string): void;
  markDirty(charCount: number, autoSaveAt: number): void;
  markSaveError(reason: string, retryCount?: number): void;
  reset(): void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  projectHash: null,
  chapter: null,
  state: { kind: "loading" },
  charCount: 0,

  setProjectHash: (hash) => set({ projectHash: hash }),
  setChapter: (ctx) => set({ chapter: ctx }),
  setTitle: (title) =>
    set((s) => (s.chapter ? { chapter: { ...s.chapter, title } } : {})),
  markLoading: () => set({ state: { kind: "loading" } }),
  markClean: (newMtime, newContent, newFileTitle) =>
    set((s) => ({
      state: { kind: "clean" },
      chapter: s.chapter
        ? { ...s.chapter, baseMtime: newMtime, baseContent: newContent, fileTitle: newFileTitle }
        : null,
    })),
  markDirty: (charCount, autoSaveAt) =>
    set({ state: { kind: "browser-only", lastAutoSaveAt: autoSaveAt }, charCount }),
  markSaveError: (reason, retryCount = 0) =>
    set({ state: { kind: "save-error", reason, retryCount } }),
  reset: () =>
    set({
      chapter: null,
      state: { kind: "loading" },
      charCount: 0,
    }),
}));
