// ── Portrait types（Spec 002b） ────────────────────────────────────────────

export type PortraitScope = "default" | "chapter";

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface PortraitInfo {
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  uploadedAt: string;
  hasExtracted: boolean;
}

export interface UploadPortraitResponse {
  scope: PortraitScope;
  chapterNumber: number | null;
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  resized: boolean;
  commitSha: string;
}

export interface ExtractPortraitRequest {
  scope: PortraitScope;
  chapterNumber: number | null;
  modelOverride?: string;
}

export interface ExtractorOutput {
  hairAndColor: string;
  eyes: string;
  bodyType: string;
  otherFeatures: string;
  clothing: string;
  heightHint?: string;
  confidence: Partial<Record<keyof ExtractorOutput, "high" | "medium" | "low">>;
  chapterNote?: string;
}

export interface ExtractPortraitResponse {
  extracted: ExtractorOutput;
  writtenTo: "fields.appearance" | { chapterNumber: number };
  modelId: string;
  durationMs: number;
  commitSha: string | null;
}

export interface ListPortraitsResponse {
  default: PortraitInfo | null;
  byChapter: Array<PortraitInfo & { chapterNumber: number }>;
}

export interface DeletePortraitRequest {
  scope: PortraitScope;
  chapterNumber: number | null;
}
