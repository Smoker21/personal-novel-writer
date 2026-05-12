// Core domain types for Novel Writer prototype.
// Single source of truth used by IDB layer, components, and fake data.

export type ChapterStatus = 'draft' | 'saved' | 'adopted';

export interface Project {
  slug: string;            // stable URL-friendly id (used as IDB key)
  name: string;            // display name (e.g. "春日記事")
  path: string;            // fake local path
  synopsis: string;
  createdAt: number;
  lastOpenedAt: number;
}

export interface Character {
  id: string;
  projectSlug: string;
  // 6 區塊欄位
  name: string;
  age?: number;
  gender?: string;
  pronoun?: string;
  role?: string;
  personalityTags: string[];
  mbti?: string;
  zodiac?: string;
  bloodType?: string;
  culturalBackground?: string;
  heightCm?: number;
  bodyType?: string;
  hairAndColor?: string;
  eyes?: string;
  otherFeatures?: string;
  dialoguePace?: 'slow' | 'medium' | 'fast';
  wordingPreference?: string;
  writingAvoid?: string;
  relations?: string;
  intimateNotes?: string;
  // AI 統整內容
  body: string;
  bodyLastModel?: string;
  bodyLastGeneratedAt?: number;
  bodyLastGeneratedHash?: string; // for manuallyEdited detection
  manuallyEdited: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  projectSlug: string;
  number: number;
  title: string;
  content: string;
  status: ChapterStatus;
  wordCount: number;
  updatedAt: number;
  savedAt?: number; // last time written to .md (fake)
}

export interface StatusDoc {
  id: string;            // composite: `<projectSlug>:story` or `<projectSlug>:char:<charId>`
  projectSlug: string;
  kind: 'story' | 'character';
  charId?: string;       // when kind = character
  content: string;
  updatedAt: number;
}

export interface Commit {
  id: string;             // commit hash (fake)
  projectSlug: string;
  fileKey: string;        // e.g. "chapter:<chapterId>" or "status:story" or "char:<id>"
  message: string;
  authorTime: number;
  wordDelta: number;      // +420 / -50
  snapshotContent: string; // full content at this commit (fake)
  isCurrent: boolean;
}

export interface ProviderSettings {
  id: 'anthropic' | 'openai' | 'gemini' | 'lmstudio' | 'ollama' | 'rwkv-runner';
  label: string;
  enabled: boolean;
  apiKey?: string;     // masked when shown
  endpoint?: string;   // for local providers
  testStatus?: 'idle' | 'testing' | 'success' | 'fail';
  testError?: string;
  models: string[];    // available models on this provider
}

export interface AgentModelConfig {
  agent: 'chapter-writer' | 'status-updater' | 'character-card-consolidator' | 'status-shortener';
  primary?: string;       // "anthropic:claude-sonnet-4-6"
  fallbacks: string[];
}

export interface Settings {
  id: 'singleton';
  providers: ProviderSettings[];
  agents: AgentModelConfig[];
  preferences: {
    darkMode: boolean;
    editorWidth: 'narrow' | 'normal' | 'wide';
    autosaveDebounceMs: number;
    skipAdoptionConfirm: boolean;
  };
}

export type SaveState = 'clean' | 'dirty' | 'saved';

export interface Qwen3Params {
  temperature: number;       // 0.0–2.0, default 0.7
  topP: number;              // 0.0–1.0, default 0.9
  topK: number;              // 1–200, default 40
  minP: number;              // 0.0–1.0, default 0.0
  repetitionPenalty: number; // 1.0–2.0, default 1.1
  maxTokens: number;         // 256–32768, default 4096
  enableThinking: boolean;   // default false
  thinkingBudget: number;    // 500–16000, default 2000
}

export const DEFAULT_QWEN3_PARAMS: Qwen3Params = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.0,
  repetitionPenalty: 1.1,
  maxTokens: 4096,
  enableThinking: false,
  thinkingBudget: 2000,
};

export interface RecentProjectEntry {
  slug: string;
  name: string;
  path: string;
  lastOpenedAt: number;
  chapterCount: number;
}
