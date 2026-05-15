// ── MBTI / Zodiac / BloodType ─────────────────────────────────────────────

export type MBTI =
  | "INTJ"
  | "INTP"
  | "ENTJ"
  | "ENTP"
  | "INFJ"
  | "INFP"
  | "ENFJ"
  | "ENFP"
  | "ISTJ"
  | "ISFJ"
  | "ESTJ"
  | "ESFJ"
  | "ISTP"
  | "ISFP"
  | "ESTP"
  | "ESFP";

export type Zodiac =
  | "牡羊座"
  | "金牛座"
  | "雙子座"
  | "巨蟹座"
  | "獅子座"
  | "處女座"
  | "天秤座"
  | "天蠍座"
  | "射手座"
  | "摩羯座"
  | "水瓶座"
  | "雙魚座";

// ── CharacterFields（6 分區） ─────────────────────────────────────────────

export interface CharacterFields {
  // 1. 身分基礎（name 必填）
  name: string;
  age: number | null;
  gender: string | null;
  pronoun: string | null;
  role: "主角" | "配角" | "反派" | "重要路人" | string | null;

  // 2. 個性參考
  personalityTags: string[];
  mbti: MBTI | null;
  zodiac: Zodiac | null;
  bloodType: "A" | "B" | "O" | "AB" | null;
  culturalBackground: string | null;

  // 3. 外貌參考（預設 / 基準）
  heightCm: number | null;
  bodyType: string | null;
  hairAndColor: string | null;
  eyes: string | null;
  otherFeatures: string | null;
  clothing: string | null;

  // 3b. 圖片（path 相對於專案根；Story 002b）
  portrait: {
    default: string | null;
    byChapter: Record<number, string>;
  };

  // 3c. 章節外貌演進（vision 解析後或使用者手填）
  appearanceByChapter: Record<number, string>;

  // 4. 對話與寫作
  dialoguePace: "快" | "穩" | "慢" | null;
  wordingPreference: string | null;
  writingAvoid: string | null;

  // 5. 與其他角色的關係
  relations: string | null;

  // 6. 性愛場景表現（M5 rename 自 intimateAppendix）
  sexualScenePerformance: {
    bodyMeasurements: string | null;
    preferences: string | null;
  } | null;

  // AI 統整 metadata
  consolidatedAt: string | null;
  consolidatedBy: string | null;
  /** M5: per-section dirty flag — 取代 manuallyEdited boolean */
  manuallyEditedSections: {
    manualDescription: boolean;
    aiSummary: boolean;
  };
}

// ── CharacterCard ─────────────────────────────────────────────────────────

export interface CharacterCard {
  slug: string;
  fields: CharacterFields;
  /** Server-assembled body containing both sections (含 headings)；前端可直接顯示或解析 */
  body: string;
  /** M5: 「## 角色描述（手動）」段內容（不含 heading） */
  manualDescription: string;
  /** M5: 「## AI 統整敘述」段內容（不含 heading） */
  aiSummary: string;
}

// ── CharacterListItem（列表簡要，供角色面板用） ────────────────────────────

export interface CharacterListItem {
  slug: string;
  name: string;
  role: string | null;
  age: number | null;
  oneLineSummary: string;
  /** Relative path (e.g. "characters/_assets/<slug>/default.jpg") or null. */
  portraitDefault: string | null;
}

// ── Consolidator I/O ──────────────────────────────────────────────────────

export interface ConsolidatorInput {
  fields: CharacterFields;
}

export interface ConsolidatorOutput {
  /** M5: 對應「## AI 統整敘述」段 — 不直接寫檔，前端 textarea 預覽後使用者按儲存才送 PUT */
  aiSummary: string;
  oneLineSummary: string;
}

// ── CharacterCardInContext（chapter-writer 用；含 currentAppearance） ───────

export interface CharacterCardInContext {
  slug: string;
  name: string;
  fields: CharacterFields;
  body: string;
  currentAppearance: string;
}

// ── API request / response shapes ─────────────────────────────────────────

export interface CreateCharacterRequest {
  name: string;
  fields: CharacterFields;
  consolidate?: boolean;
}

export interface UpdateCharacterRequest {
  fields?: Partial<CharacterFields>;
  /** M5: 「## 角色描述（手動）」段；undefined = 不動；空字串 = 清空 */
  manualDescription?: string;
  /** M5: 「## AI 統整敘述」段；undefined = 不動；空字串 = 清空 */
  aiSummary?: string;
  consolidate?: boolean;
  rename?: string;
}

export interface CharacterResponse {
  slug: string;
  path: string;
  fields: CharacterFields;
  body: string;
  manualDescription: string;
  aiSummary: string;
  consolidatedAt: string | null;
  consolidatedBy: string | null;
}

export interface CharacterListResponse {
  characters: CharacterListItem[];
}

export interface ConsolidateRequest {
  modelOverride?: string;
}

export interface ConsolidateResponse {
  aiSummary: string;
  oneLineSummary: string;
  consolidatedAt: string;
  consolidatedBy: string;
  usage: { inputTokens: number; outputTokens: number };
}
