// ── M3 status-updater 型別 ────────────────────────────────────────────────

export type UpdateReason = "auto-after-save" | "auto-after-adopt" | "manual";

export interface StatusUpdateRequest {
  chapterNumber: number;
  reason: UpdateReason;
}

export interface StatusUpdateResponse {
  jobId: string;
}

export type StatusJobEvent =
  | { type: "started"; model: string; chapterNumber: number }
  | { type: "progress"; phase: string; details?: Record<string, unknown> }
  | { type: "completed"; skipped: boolean; retries: number }
  | { type: "failed"; code: string; message: string; retries: number };

export interface StatusShortenRequest {
  fileType: "story" | "character";
  characterSlug?: string;
  preserveMarkedSections: boolean;
  modelOverride?: string;
}

export interface StatusShortenResponse {
  shortenedContent: string;
  preservedSections: string[];
}
