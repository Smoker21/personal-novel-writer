import { LLMError, redactSecrets } from "../error.js";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelCapabilities,
  ProviderBalance,
  ProviderModel,
  StreamChunk,
  StructuredNovelGenerateParams,
  StructuredNovelPolishParams,
  StructuredNovelProvider,
} from "../types.js";

// ---------------------------------------------------------------------------
// XiaohuangwenAdapter — spec 011 / ADR-0010
//
// 小說專用 API：
//   - Base URL：https://www.xiaohuangwen.com
//   - 認證：`Authorization: Bearer <api_key>`
//   - Streaming：plain text（非 SSE JSON event）— 自己解 reader
//   - 計費：字數（remaining_words）— 不是 token
//   - 不接受 messages array — 純 structured provider
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://www.xiaohuangwen.com";
const PROVIDER_ID = "xiaohuangwen";

/** 唯二支援的 version。 */
const SUPPORTED_VERSIONS = new Set(["latest", "stable"]);

/** xiaohuangwen `/api/v1/generate` request body 形狀。 */
interface GenerateBody {
  plot: string;
  version: string;
  background?: string;
  requirements?: string;
  pre_summary?: string;
  prev_segment?: string;
}

/** xiaohuangwen `/api/v1/polish` request body 形狀。 */
interface PolishBody {
  pre_output: string;
  polish_input: string;
  version: string;
}

const BASE_CAPABILITIES: ModelCapabilities = {
  // 不適用：API 內建 prompt engineering，context window 由 API 端管理
  contextWindow: Number.NaN,
  maxOutputTokens: Number.NaN,
  supportsStreaming: true,
  supportsToolCalls: false,
  supportsVision: false,
  hasStructuredNovelGenerate: true,
};

// ---------------------------------------------------------------------------
// HTTP error mapping (spec 011 §錯誤映射)
// ---------------------------------------------------------------------------

/**
 * 對應 spec 011 錯誤映射表：
 *   401/403 → unauthorized (非 retryable)
 *   402 / 「餘額不足」 → quota_exhausted (非 retryable)
 *   429 → rate_limit (retryable)
 *   5xx → network (retryable)
 *   其他 4xx → unknown (非 retryable)
 */
function mapHttpError(status: number, bodyText: string): LLMError {
  const safeBody = redactSecrets(bodyText);
  // 餘額不足在某些 API 設計可能用 402 也可能用 200/4xx body 帶關鍵字
  const lower = safeBody.toLowerCase();
  const looksQuota =
    status === 402 ||
    safeBody.includes("餘額不足") ||
    lower.includes("insufficient") ||
    lower.includes("quota");

  if (looksQuota) {
    return new LLMError("quota_exhausted", PROVIDER_ID, safeBody || "餘額不足", false);
  }

  if (status === 401 || status === 403) {
    return new LLMError("unauthorized", PROVIDER_ID, safeBody || "API key 無效", false);
  }
  if (status === 429) {
    return new LLMError("rate_limit", PROVIDER_ID, safeBody || "rate limited", true);
  }
  if (status >= 500) {
    return new LLMError("network", PROVIDER_ID, safeBody || `server error ${status}`, true);
  }
  // 其他 4xx（含 400 invalid input）— spec 011 line 213 統一歸 "unknown"
  return new LLMError("unknown", PROVIDER_ID, safeBody || `HTTP ${status}`, false);
}

/** 把網路層 / fetch 拋出的 Error 翻譯成 LLMError。 */
function mapFetchError(err: unknown): LLMError {
  if (err instanceof LLMError) return err;
  if (err instanceof Error) {
    return new LLMError("network", PROVIDER_ID, redactSecrets(err.message), true, err);
  }
  return new LLMError("network", PROVIDER_ID, "unknown network error", true, err);
}

// ---------------------------------------------------------------------------
// Codepoint counter — 與 packages/shared-types/src/text-count.ts 一致
// ---------------------------------------------------------------------------

function countCodepoints(text: string): number {
  // 用 spread + iterator 計 codepoint（surrogate pair 算 1）
  let n = 0;
  for (const _ of text) n++;
  return n;
}

// ---------------------------------------------------------------------------
// XiaohuangwenAdapter
// ---------------------------------------------------------------------------

export class XiaohuangwenAdapter implements LLMProvider, StructuredNovelProvider {
  readonly id = PROVIDER_ID;
  readonly origin = "novel-api" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    // 去掉結尾斜線方便拼接
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  // -------------------------------------------------------------------------
  // LLMProvider 介面 — 純 structured provider 不支援 messages-array
  // -------------------------------------------------------------------------

  // biome-ignore lint/correctness/useYield: 純 structured provider 一律 throw
  async *stream(_request: GenerateRequest): AsyncIterable<StreamChunk> {
    throw new LLMError(
      "operation_not_supported",
      this.id,
      "xiaohuangwen 只支援結構化生成；請改呼 generateNovel() / polishNovel()",
      false,
    );
  }

  async generate(_request: GenerateRequest): Promise<GenerateResponse> {
    throw new LLMError(
      "operation_not_supported",
      this.id,
      "xiaohuangwen 只支援結構化生成；請改呼 generateNovel() / polishNovel()",
      false,
    );
  }

  capabilities(modelId: string): ModelCapabilities | null {
    // 接受帶 provider 前綴或裸 version
    const idx = modelId.indexOf(":");
    const version = idx >= 0 ? modelId.slice(idx + 1) : modelId;
    if (!SUPPORTED_VERSIONS.has(version)) return null;
    return { ...BASE_CAPABILITIES };
  }

  async listModels(_opts?: { signal?: AbortSignal }): Promise<ProviderModel[]> {
    // API 無 /models endpoint — 硬編兩個 version
    return [
      { id: "latest", displayName: "latest（最新版）" },
      { id: "stable", displayName: "stable（穩定版）" },
    ];
  }

  async ping(): Promise<{ ok: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.getBalance();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }

  // -------------------------------------------------------------------------
  // StructuredNovelProvider 介面
  // -------------------------------------------------------------------------

  async *generateNovel(params: StructuredNovelGenerateParams): AsyncIterable<StreamChunk> {
    if (!params.plot || params.plot.length === 0) {
      throw new LLMError("unknown", this.id, "generateNovel: `plot` 必填", false);
    }
    const version = params.version ?? "latest";
    const body: GenerateBody = {
      plot: params.plot,
      version,
    };
    if (params.background !== undefined) body.background = params.background;
    if (params.requirements !== undefined) body.requirements = params.requirements;
    if (params.pre_summary !== undefined) body.pre_summary = params.pre_summary;
    if (params.prev_segment !== undefined) body.prev_segment = params.prev_segment;

    yield* this.streamPlainTextPost(
      `${this.baseUrl}/api/v1/generate`,
      body,
      version,
      params.abortSignal,
    );
  }

  async *polishNovel(params: StructuredNovelPolishParams): AsyncIterable<StreamChunk> {
    if (!params.pre_output || params.pre_output.length === 0) {
      throw new LLMError("unknown", this.id, "polishNovel: `pre_output` 必填", false);
    }
    if (!params.polish_input || params.polish_input.length === 0) {
      throw new LLMError("unknown", this.id, "polishNovel: `polish_input` 必填", false);
    }
    const version = params.version ?? "latest";
    const body: PolishBody = {
      pre_output: params.pre_output,
      polish_input: params.polish_input,
      version,
    };

    yield* this.streamPlainTextPost(
      `${this.baseUrl}/api/v1/polish`,
      body,
      version,
      params.abortSignal,
    );
  }

  async getBalance(): Promise<ProviderBalance> {
    let resp: Response;
    try {
      resp = await this.fetchImpl(`${this.baseUrl}/api/v1/balance`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
    } catch (err) {
      throw mapFetchError(err);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw mapHttpError(resp.status, text);
    }

    let json: { status?: string; remaining_words?: number };
    try {
      json = (await resp.json()) as { status?: string; remaining_words?: number };
    } catch (err) {
      throw new LLMError(
        "network",
        this.id,
        `balance JSON parse failed: ${(err as Error).message}`,
        true,
        err,
      );
    }

    if (typeof json.remaining_words !== "number") {
      throw new LLMError("unknown", this.id, "balance response missing remaining_words", false);
    }
    return { remainingWords: json.remaining_words, currency: "words" };
  }

  // -------------------------------------------------------------------------
  // 內部：plain-text stream POST + chunk yield
  // -------------------------------------------------------------------------

  private async *streamPlainTextPost(
    url: string,
    body: GenerateBody | PolishBody,
    version: string,
    abortSignal?: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const fullModelId = `${this.id}:${version}`;
    const isAborted = (): boolean => abortSignal?.aborted ?? false;

    // 提前檢查 abort（避免送出 request）
    if (isAborted()) {
      yield { type: "finish", finishReason: "abort", modelId: fullModelId };
      return;
    }

    let resp: Response;
    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/plain",
        },
        body: JSON.stringify(body),
      };
      if (abortSignal !== undefined) init.signal = abortSignal;
      resp = await this.fetchImpl(url, init);
    } catch (err) {
      // fetch 拋出 AbortError → 視為使用者主動取消
      if ((err as { name?: string }).name === "AbortError" || isAborted()) {
        yield { type: "finish", finishReason: "abort", modelId: fullModelId };
        return;
      }
      throw mapFetchError(err);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw mapHttpError(resp.status, text);
    }
    if (resp.body === null) {
      throw new LLMError("network", this.id, "response body is null", true);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let totalChars = 0;
    let finishReason: "end" | "abort" = "end";

    try {
      while (true) {
        if (isAborted()) {
          finishReason = "abort";
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
        let chunk: Awaited<ReturnType<typeof reader.read>>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if ((err as { name?: string }).name === "AbortError" || isAborted()) {
            finishReason = "abort";
            break;
          }
          throw mapFetchError(err);
        }
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        if (text.length > 0) {
          totalChars += countCodepoints(text);
          yield { type: "text", text };
        }
      }
      // flush decoder tail
      const tail = decoder.decode();
      if (tail.length > 0) {
        totalChars += countCodepoints(tail);
        yield { type: "text", text: tail };
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }

    if (finishReason === "abort") {
      yield { type: "finish", finishReason: "abort", modelId: fullModelId };
      return;
    }

    // 字數計費 — 借用 outputTokens 欄位記字數（spec 011 line 188）
    yield { type: "usage", usage: { inputTokens: 0, outputTokens: totalChars } };
    yield { type: "finish", finishReason: "end", modelId: fullModelId };
  }
}
