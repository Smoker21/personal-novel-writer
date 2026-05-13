export type MBTI =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

export type Zodiac =
  | "牡羊座" | "金牛座" | "雙子座" | "巨蟹座"
  | "獅子座" | "處女座" | "天秤座" | "天蠍座"
  | "射手座" | "摩羯座" | "水瓶座" | "雙魚座";

export type BloodType = "A" | "B" | "O" | "AB";

export type DialoguePace = "快" | "穩" | "慢";

export type CharacterRole = "主角" | "配角" | "反派" | "重要路人";

export interface PortraitMap {
  default: string | null;                  // 例：characters/_assets/蘇晴/default.jpg
  byChapter: Record<number, string>;       // 章節編號 → 圖檔相對路徑
}

export interface IntimateAppendix {
  bodyMeasurements: string | null;
  preferences: string | null;
}

export interface CharacterFields {
  // 1. 身分基礎
  name: string;                            // 必填
  age: number | null;
  gender: string | null;
  pronoun: string | null;
  role: CharacterRole | string | null;

  // 2. 個性參考
  personalityTags: string[];
  mbti: MBTI | null;
  zodiac: Zodiac | null;
  bloodType: BloodType | null;
  culturalBackground: string | null;

  // 3. 外貌參考（預設 / 基準）
  heightCm: number | null;
  bodyType: string | null;
  hairAndColor: string | null;
  eyes: string | null;
  otherFeatures: string | null;
  clothing: string | null;                 // 2026-05-13 加

  // 3b. 圖片（Story 002b；2026-05-13 加）
  portrait: PortraitMap;

  // 3c. 章節外貌演進（Story 002b；2026-05-13 加）
  appearanceByChapter: Record<number, string>;

  // 4. 對話與寫作
  dialoguePace: DialoguePace | null;
  wordingPreference: string | null;
  writingAvoid: string | null;

  // 5. 關係
  relations: string | null;

  // 6. 親密附錄（預設摺疊，可 null）
  intimateAppendix: IntimateAppendix | null;

  // AI 統整 metadata
  consolidatedAt: string | null;           // ISO 8601
  consolidatedBy: string | null;           // modelId
  manuallyEdited: boolean;
}

export interface CharacterCard {
  slug: string;
  fields: CharacterFields;
  body: string;                            // AI 統整的連貫敘述
}

export interface CharacterListItem {
  slug: string;
  name: string;
  role: string | null;
  age: number | null;
  oneLineSummary: string;
}

/** 預設值 helper（給前端 dialog 初始化 + 後端建立新角色用） */
export function defaultCharacterFields(name: string): CharacterFields {
  return {
    name,
    age: null,
    gender: null,
    pronoun: null,
    role: null,
    personalityTags: [],
    mbti: null,
    zodiac: null,
    bloodType: null,
    culturalBackground: null,
    heightCm: null,
    bodyType: null,
    hairAndColor: null,
    eyes: null,
    otherFeatures: null,
    clothing: null,
    portrait: { default: null, byChapter: {} },
    appearanceByChapter: {},
    dialoguePace: null,
    wordingPreference: null,
    writingAvoid: null,
    relations: null,
    intimateAppendix: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEdited: false,
  };
}

// ────────────────────────────────────────────
// character-card-consolidator Skill 觸發合約

export interface ConsolidatorInput {
  fields: CharacterFields;
  // 不包含 body：避免 LLM 以舊 body 為基準微調
}

export interface ConsolidatorOutput {
  body: string;                            // 200~500 中文字
  oneLineSummary: string;                  // _index.md 用
}

// ────────────────────────────────────────────
// API request/response

export interface CreateCharacterRequest {
  name: string;
  fields: CharacterFields;
  consolidate?: boolean;
}

export interface CreateCharacterResponse {
  slug: string;
  path: string;
  fields: CharacterFields;
  body: string;
  consolidatedAt: string | null;
  consolidatedBy: string | null;
}

export interface UpdateCharacterRequest {
  fields?: Partial<CharacterFields>;
  body?: string;
  consolidate?: boolean;
  rename?: string;
}

export interface ConsolidateCharacterRequest {
  modelOverride?: string;
}

export interface ConsolidateCharacterResponse {
  body: string;
  oneLineSummary: string;
  consolidatedAt: string;
  consolidatedBy: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface CharacterListResponse {
  characters: CharacterListItem[];
}

export type CharacterErrorCode =
  | "INVALID_INPUT"
  | "SLUG_CONFLICT"
  | "CONSOLIDATE_FAILED"
  | "ROUTING_NOT_CONFIGURED"
  | "CHARACTER_NOT_FOUND"
  | "LLM_FAILED"
  | "IO_ERROR";
