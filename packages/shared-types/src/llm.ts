import type { CharacterCardInContext } from "./character.js";

// ── DraftMetadata ─────────────────────────────────────────────────────────

export interface DraftMetadata {
  draftId: string;
  projectHash: string;
  chapterNumber: number;
  chapterTitle: string;
  agentName: "chapter-writer";
  modelId: string;
  contextHash: string;
  status: "running" | "complete" | "aborted" | "errored";
  createdAt: string;
  completedAt?: string;
  totalChars: number;
  usage?: { inputTokens: number; outputTokens: number };
  errorCode?: string;
  errorMessage?: string;
}

// ── PromptSnapshot ────────────────────────────────────────────────────────

export interface PromptSnapshot {
  agentName: string;
  agentVersion: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  context: {
    synopsisHash: string;
    storyStatusHash: string;
    characterStatusHash: string;
    characterHashes: Record<string, string>;
    outlineHash: string | null;
    previousChapterFullTextHash: string | null;
    currentAppearanceHashes: Record<string, string>;
  };
  generatedAt: string;
  durationMs: number;
}

// ── ChapterContext（ContextCollector が組み上げる；chapter-writer に渡す） ──

export interface ChapterContext {
  synopsis: string;
  writingStyle: string;
  storyStatus: string;
  characterStatuses: Record<string, string>;
  characters: CharacterCardInContext[];
  /** M5 (spec 005): the participants list that produced this context (for audit / PromptSnapshot) */
  participantSlugs: string[];
  currentOutline: string | null;
  /** M5 (spec 005): 本章寫作需求 — Spec 003 chapter front-matter 或 build-prompt request */
  currentRequirements: string | null;
  previousChapterFullText: string | null;
  contextHash: string;
}

// ── Generate request / response shapes ───────────────────────────────────

export interface GenerateChapterRequest {
  agentName: "chapter-writer";
  modelOverride?: string;
  userIntent?: string;
}

export interface DraftResponse {
  draftId: string;
  text: string;
  status: "complete" | "aborted" | "errored";
  contextHash: string;
  createdAt: string;
  totalChars: number;
}
