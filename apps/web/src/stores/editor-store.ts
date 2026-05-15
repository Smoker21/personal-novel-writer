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
  /** M5: 基準 frontmatter（與 .md 同步時的值），給 dirty 比對用 */
  baseParticipants: string[];
  baseOutline: string | null;
  baseRequirements: string | null;
}

interface EditorStore {
  projectHash: string | null;
  chapter: ChapterContext | null;
  state: EditorStateKind;
  charCount: number;

  // M5 Spec 003 持久化 frontmatter（隨 content 一起 autosave）
  participants: string[];
  outline: string | null;
  requirements: string | null;

  // M5 Spec 003 ephemeral 寫作參數（切章/reload 後消失，不寫 frontmatter）
  modelOverride: string | null;
  temperatureOverride: number | null;
  systemPromptOverrideForChapter: string;

  setProjectHash(hash: string): void;
  setChapter(ctx: ChapterContext): void;
  setTitle(title: string): void;
  markLoading(): void;
  markClean(
    newMtime: string,
    newContent: string,
    newFileTitle: string,
    newFrontmatter: { participants: string[]; outline: string | null; requirements: string | null },
  ): void;
  markDirty(charCount: number, autoSaveAt: number): void;
  markSaveError(reason: string, retryCount?: number): void;

  setParticipants(next: string[]): void;
  setOutline(next: string | null): void;
  setRequirements(next: string | null): void;
  setModelOverride(next: string | null): void;
  setTemperatureOverride(next: number | null): void;
  setSystemPromptOverrideForChapter(next: string): void;

  reset(): void;
}

const FRONTMATTER_DEFAULTS = {
  participants: [] as string[],
  outline: null as string | null,
  requirements: null as string | null,
};

export const useEditorStore = create<EditorStore>((set) => ({
  projectHash: null,
  chapter: null,
  state: { kind: "loading" },
  charCount: 0,
  participants: [],
  outline: null,
  requirements: null,
  modelOverride: null,
  temperatureOverride: null,
  systemPromptOverrideForChapter: "",

  setProjectHash: (hash) => set({ projectHash: hash }),
  setChapter: (ctx) =>
    set({
      chapter: ctx,
      participants: ctx.baseParticipants,
      outline: ctx.baseOutline,
      requirements: ctx.baseRequirements,
    }),
  setTitle: (title) => set((s) => (s.chapter ? { chapter: { ...s.chapter, title } } : {})),
  markLoading: () => set({ state: { kind: "loading" } }),
  markClean: (newMtime, newContent, newFileTitle, newFrontmatter) =>
    set((s) => ({
      state: { kind: "clean" },
      chapter: s.chapter
        ? {
            ...s.chapter,
            baseMtime: newMtime,
            baseContent: newContent,
            fileTitle: newFileTitle,
            baseParticipants: newFrontmatter.participants,
            baseOutline: newFrontmatter.outline,
            baseRequirements: newFrontmatter.requirements,
          }
        : null,
      participants: newFrontmatter.participants,
      outline: newFrontmatter.outline,
      requirements: newFrontmatter.requirements,
    })),
  markDirty: (charCount, autoSaveAt) =>
    set({ state: { kind: "browser-only", lastAutoSaveAt: autoSaveAt }, charCount }),
  markSaveError: (reason, retryCount = 0) =>
    set({ state: { kind: "save-error", reason, retryCount } }),

  setParticipants: (next) => set({ participants: next }),
  setOutline: (next) => set({ outline: next }),
  setRequirements: (next) => set({ requirements: next }),
  setModelOverride: (next) => set({ modelOverride: next }),
  setTemperatureOverride: (next) => set({ temperatureOverride: next }),
  setSystemPromptOverrideForChapter: (next) => set({ systemPromptOverrideForChapter: next }),

  reset: () =>
    set({
      chapter: null,
      state: { kind: "loading" },
      charCount: 0,
      ...FRONTMATTER_DEFAULTS,
      modelOverride: null,
      temperatureOverride: null,
      systemPromptOverrideForChapter: "",
    }),
}));
