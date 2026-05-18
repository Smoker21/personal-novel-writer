/**
 * polish-prose service — capability-flag dispatch。
 *
 * 依 routing primary modelId 的 provider capability 決定走哪條 path：
 *   - hasStructuredNovelGenerate = true  → xiaohuangwen path（LLMRouter.polishNovel）
 *   - hasStructuredNovelGenerate = false → 普通 LLM path（LLMRouter.stream + prompt template）
 *
 * 統一回 AsyncIterable<StreamChunk>；route handler 負責 SSE 轉換。
 *
 * 參照：
 *   - docs/architecture/specs/012-polish-prose-flow.md §「Dispatch 邏輯」
 *   - docs/skills/polish-prose.md §5 System prompt
 *   - packages/llm-adapter/src/types.ts（StructuredNovelPolishParams / LLMRouter）
 */
import type { StreamChunk } from "@novel-writer/llm-adapter";
import { buildPolishProsePrompt } from "@novel-writer/prompt-library";
import type { AppSettings, RoutingPolicy } from "@novel-writer/shared-types";
import { buildRouter, toRouterPolicy } from "./router-factory.js";
import { parseModelId } from "@novel-writer/llm-adapter";

export interface PolishProseParams {
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  /** 空字串 = 自由潤飾 */
  polishInput: string;
  routing: RoutingPolicy;
  settings: AppSettings;
  abortSignal?: AbortSignal;
}

/**
 * 判斷 modelId 的 provider 是否為 structured-only（capability flag）。
 *
 * 與 chapter-writer-dispatch.ts 的 getModelKind() 同邏輯，但
 * polish-prose service 直接判斷，避免 chapter-writer 命名污染依賴。
 */
const STRUCTURED_PROVIDER_IDS = new Set<string>(["xiaohuangwen"]);

function isStructuredProvider(primaryModelId: string): boolean {
  try {
    const { provider } = parseModelId(primaryModelId);
    return STRUCTURED_PROVIDER_IDS.has(provider);
  } catch {
    return false;
  }
}

/**
 * 執行 polish-prose Skill — 兩條 path。
 *
 * @returns AsyncIterable<StreamChunk> — route handler 消費
 */
export async function* polishProse(params: PolishProseParams): AsyncIterable<StreamChunk> {
  const { selectedText, contextBefore, contextAfter, polishInput, routing, settings, abortSignal } =
    params;

  const router = buildRouter(settings);
  const policy = toRouterPolicy(routing);

  if (isStructuredProvider(policy.primary)) {
    // ── xiaohuangwen path ────────────────────────────────────────────────────
    // API 端不接受 contextBefore / contextAfter（spec 012 §9 / skill spec §9）
    const polishParams: import("@novel-writer/llm-adapter").StructuredNovelPolishParams = {
      pre_output: selectedText,
      polish_input: polishInput,
      version: parseModelId(policy.primary).model,
    };
    if (abortSignal !== undefined) polishParams.abortSignal = abortSignal;

    yield* router.polishNovel(polishParams, {
      primary: policy.primary,
      retryPerModel: policy.retryPerModel,
    });
  } else {
    // ── 普通 LLM path ─────────────────────────────────────────────────────────
    const { systemPrompt, userMessage } = buildPolishProsePrompt({
      selectedText,
      polishInput,
      ...(contextBefore !== undefined && { contextBefore }),
      ...(contextAfter !== undefined && { contextAfter }),
    });

    const streamReq: import("@novel-writer/llm-adapter").GenerateRequest = {
      modelId: policy.primary,
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: 4096,
      temperature: routing.temperature ?? 0.7,
    };
    if (abortSignal !== undefined) streamReq.abortSignal = abortSignal;

    yield* router.stream(streamReq, policy);
  }
}
