# 0009. LLM adapter vision 擴充

- Status: `Accepted`
- Date: `2026-05-13`
- Deciders: spec-architect
- Amends: [ADR-0004](./0004-llm-adapter.md)

## Context

Story 002b 從 v0.2 defer 升級為 MVP 範圍（2026-05-13），加上**章節敏感的角色外貌演進**需求：使用者上傳角色參考圖 → vision LLM 解析外貌 / 髮型 / 服裝 → 寫進 frontmatter。

[ADR-0004](./0004-llm-adapter.md) 設計時已預留 `ModelCapabilities.supportsVision: boolean`，但**沒設計 image 輸入的 message 結構**。本 ADR 補上。

需求面：

- 支援單張圖（MVP）+ 預留多張的擴充能力
- 圖檔讀本機 path，由 adapter 端讀檔 + 編碼（base64 / URL）
- 對所有 vision-capable provider 統一介面（Anthropic / OpenAI / Google / xAI / 地端 Qwen3-VL）
- 不能破壞現有 `ChatMessage.content: string` 的相容性

## Decision

### `ChatMessage.content` 從 `string` 改為 `string | Content[]`

```ts
// packages/llm-adapter/src/types.ts

export type Content = TextContent | ImageContent;

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source:
    | { kind: "path"; path: string }      // 本機絕對路徑；adapter 讀檔 + 編碼
    | { kind: "base64"; data: string; mimeType: ImageMimeType }
    | { kind: "url"; url: string };       // 雲端 URL（部分 provider 支援）
}

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Content[];           // 向後相容：純文字仍可用 string
}
```

**相容性**：所有現有 `content: string` 的呼叫不變；要加圖時改用 `content: [{type:"text",...},{type:"image",...}]`。adapter 內部對 `string` 用 helper 升級為 `[{type:"text",text:value}]`。

### Provider-side 編碼責任

Adapter 收到 `{kind:"path"}` 時自己 fs.readFile + base64 編碼，再依各 provider 的 API format 送出：

| Provider | API 接受形式 | 編碼方式 |
|---|---|---|
| Anthropic | base64（content block `type: "image"`） | `{source:{type:"base64",media_type:..., data:...}}` |
| OpenAI | URL 或 base64 data URL | `data:image/png;base64,...` URL |
| Google Gemini | base64 inline | `inline_data: { mime_type, data }` |
| xAI Grok | OpenAI-compatible | 同 OpenAI |
| Ollama（地端，部分模型支援） | OpenAI-compatible | 同 OpenAI |
| LM Studio（OpenAI-compat） | 同 OpenAI | 同 OpenAI |
| RWKV-Runner | 不支援 vision | 拒絕 + LLMError code: `model_lacks_capability` |

### `ModelCapabilities.supportsVision` 不變

ADR-0004 已有此 boolean；本 ADR 補完語意：

```ts
capabilities(modelId: string): ModelCapabilities | null;
```

vision 不支援的模型：

- `supportsVision: false`
- 收到含 image 的 request → 抛 `LLMError(code: "model_lacks_capability")`

LLMRouter 降級時跳過不支援 vision 的 fallback。

### LLMError 新增 code

```ts
export type LLMErrorCode =
  | ...                                  // 原有 codes
  | "model_lacks_capability"             // 例：把圖丟給純文字模型
  | "image_too_large"                    // 圖檔超過 provider 限制
  | "image_format_unsupported";          // 例：HEIC 給 Anthropic
```

### Image 大小與格式限制

- **MVP 強制限制**（client + server 雙重驗證）：
  - 單張 ≤ 5 MB（base64 編碼後約 6.7 MB；接近 Anthropic / OpenAI 的 20 MB 上限保守值）
  - 格式：`image/jpeg`、`image/png`、`image/webp`；不支援 HEIC / TIFF / SVG / animated GIF
  - 解析度：上限 4096 × 4096 像素（超過時 server 端 resize；用 sharp lib）
- **多張**：MVP 單張為主，介面預留 array

### 已知 vision-capable 模型清單（MVP 出貨時內嵌）

| Model ID | Context window | 備註 |
|---|---|---|
| `anthropic:claude-sonnet-4-6` | 200k | 中文品質高、對成人 / 暴力較嚴 |
| `anthropic:claude-haiku-4-5` | 200k | 便宜 / 快、品質中上 |
| `openai:gpt-4.1` | 128k | 中文偏弱 |
| `openai:gpt-4.1-mini` | 128k | 便宜版 |
| `google:gemini-2.5-pro` | 1M | 多語強、含寬限免費層 |
| `google:gemini-2.5-flash` | 1M | 便宜 |
| `xai:grok-2-vision` | 8k | 內容自由度高 |
| `lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus` | 32k | 地端首選；evaluation 已驗 |
| `ollama:llava:13b` | 4k | 地端最小可行（品質一般） |

Provider 啟動時可呼叫各家 `/models` 端點動態取得最新清單；上述為 MVP 內建 fallback。

## Consequences

**Positive:**

- 既有 `content: string` 全部不變；新功能加在新型別上
- 統一 image source 處理（path / base64 / URL）讓 caller 不需要知道 provider 細節
- LLMRouter 能 capability-aware 降級（vision request 自動跳過純文字 fallback）
- 影響面集中在 llm-adapter 內部；caller（character-image-extractor Skill 等）寫法簡潔

**Negative:**

- adapter 內部 fs.readFile 與 image resize 增加依賴（`sharp` lib，native module）
- base64 編碼讓記憶體占用增加（5MB 圖 → 6.7MB base64）；MVP 可接受
- 圖檔大小驗證在 client + server 雙重做，增加些重複邏輯
- RWKV-Runner 永遠不支援 vision（架構限制）；UI 要明確標示

**Neutral:**

- 多圖支援只是介面預留；MVP UI 只暴露單張上傳

## Alternatives considered

### 1. 純 URL 不支援本機 path
- Pros: 簡單，無需處理 fs / base64
- Cons: 使用者上傳的本機圖要先送到 cloud storage 才能用；違反「個人本機工具」定位
- 為何不選：本機圖直接送 base64 對 vision API 是標準作法

### 2. 把 vision 拉出 LLM adapter 變獨立 vision-adapter package
- Pros: 純文字 LLM 與 vision LLM 解耦
- Cons: 多數 provider 文字 + vision 是同一 endpoint；分兩個 adapter 增加維護
- 為何不選：YAGNI；現有 `ModelCapabilities` 已足夠

### 3. 自寫 `ImageContent.kind: "file_id"` 用 provider 端的檔案上傳機制（OpenAI Files API）
- Pros: 大圖 / 重複用同圖效率好
- Cons: 各家 file API 不一致；MVP 用不到
- 為何不選：複雜度爆炸，留 v0.2

## 對其他文件的影響

- **[Spec 002](../specs/002-edit-character-card.md)**：CharacterFields 加 `portrait` 與 `appearanceByChapter` 結構
- **[Spec 002b](../specs/002b-character-card-from-image.md)**（新寫）：圖片上傳 + 觸發 character-image-extractor Skill
- **[Spec 005](../specs/005-ai-write-chapter.md)**：ChapterContext 加 `appearance` 按章節 lookup 邏輯（與 vision 無關，但同 PR 一起改）
- **[docs/skills/character-image-extractor.md](../../skills/character-image-extractor.md)**（新寫）：Vision Skill 規格
- **[docs/agents/chapter-writer.md](../../agents/chapter-writer.md)**：輸入合約加 `currentAppearance`（章節敏感）

## 不在範圍

- **AI 生圖**：留 Story 002c（v0.3+）
- **影片解析**：留未來；vision 模型本身不支援
- **OCR**（從圖讀字）：MVP 場景不需要
- **多 vision 端混合**（同時跑兩家比較結果）：留 v0.2+

## References

- ADR-0004 LLM adapter interface
- Anthropic vision API: https://docs.anthropic.com/en/docs/build-with-claude/vision
- OpenAI vision: https://platform.openai.com/docs/guides/vision
- Google Gemini vision: https://ai.google.dev/gemini-api/docs/vision
- xAI Grok vision: https://docs.x.ai/docs/api-reference#vision
- Qwen3-VL: https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct
