export type LLMErrorCode =
  | "rate_limit"
  | "context_overflow"
  | "unauthorized"
  | "network"
  | "content_blocked"
  | "model_not_found"
  | "model_lacks_capability"
  | "image_too_large"
  | "image_format_unsupported"
  // M6 (ADR-0010)：純 structured provider 收到 unstructured 請求
  | "operation_not_supported"
  // M6 (ADR-0010)：以字數 / credit 計費的 provider 餘額不足
  | "quota_exhausted"
  | "unknown";

export class LLMError extends Error {
  override readonly name = "LLMError";

  constructor(
    public readonly code: LLMErrorCode,
    public readonly provider: string,
    message: string,
    public readonly retryable: boolean,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Strips API keys from strings before they reach logs or error messages.
 *
 * Patterns redacted:
 *  - Anthropic keys:  sk-ant-[a-zA-Z0-9_-]{20,}
 *  - OpenAI-style keys: sk-[a-zA-Z0-9_-]{20,}  (does NOT overlap Anthropic)
 */
export function redactSecrets(text: string): string {
  // Order matters: match the more-specific Anthropic pattern first so we
  // don't clobber just the "sk-" prefix and leave "ant-…" visible.
  return text
    .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]");
}
