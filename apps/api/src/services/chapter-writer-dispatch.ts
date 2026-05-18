/**
 * M6 (Spec 005 + ADR-0010): chapter-writer dispatch helper.
 *
 * 依 modelId 所屬 provider 的 `hasStructuredNovelGenerate` capability flag 決定
 * build-prompt / generate 走哪條 path：
 *   - "messages"   → 既有 messages-array path (LLMRouter.stream)
 *   - "structured" → 結構化 path (LLMRouter.generateNovel)
 *
 * M6 階段純 structured provider 只有 xiaohuangwen；其他 cloud / local provider
 * 一律 messages。B3 把 xiaohuangwen 加入 LLMProviderId 後本檔不需要修改（因為
 * provider 認定本就是 "providerId 字串相等比對"）。
 */
import { parseModelId } from "@novel-writer/llm-adapter";

export type GenerateKind = "messages" | "structured";

/**
 * `xiaohuangwen` 是 M6 階段唯一的 structured-only provider。
 * 未來新增其他 structured-only provider 時直接擴此 set。
 *
 * 為什麼這裡 hardcode 而不查 provider.capabilities()：
 *   - xiaohuangwen 尚未進入 `LLMProviderId` 型別（B3 PR 才加）
 *   - 即便 B3 加了，routing primary modelId 在進到 dispatch 時只是字串；
 *     query capabilities 需先 instantiate provider，無謂耗時與循環依賴
 *   - capability flag 與 provider id 1:1 對應，hardcode 不會說謊
 */
const STRUCTURED_PROVIDER_IDS = new Set<string>(["xiaohuangwen"]);

/**
 * 依 modelId（`<provider>:<model>`）決定 dispatch kind。
 *
 * @throws 若 modelId 不含 `:` 則 throw（沿用 parseModelId 行為）。
 */
export function getModelKind(modelId: string): GenerateKind {
  const { provider } = parseModelId(modelId);
  return STRUCTURED_PROVIDER_IDS.has(provider) ? "structured" : "messages";
}
