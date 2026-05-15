import { describe, expect, it } from "vitest";
import { LLMError, redactSecrets } from "./error.js";

describe("redactSecrets", () => {
  it("redacts a full Anthropic API key", () => {
    const raw = "Authorization: Bearer sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";
    expect(redactSecrets(raw)).toBe("Authorization: Bearer [REDACTED]");
  });

  it("redacts an OpenAI-style key", () => {
    const raw = "key=sk-abcdefghijklmnopqrstuvwxyz";
    expect(redactSecrets(raw)).toBe("key=[REDACTED]");
  });

  it("does NOT redact short strings that only partially match (fewer than 20 chars after prefix)", () => {
    // "sk-foo" has only 3 chars after "sk-" — below the 20-char threshold
    const raw = "test sk-foo error";
    expect(redactSecrets(raw)).toBe("test sk-foo error");
  });

  it("leaves strings with no secrets unchanged", () => {
    const raw = "model not found for provider anthropic";
    expect(redactSecrets(raw)).toBe(raw);
  });

  it("redacts multiple keys in one string", () => {
    const raw = `key1=sk-ant-api03-${"a".repeat(30)} key2=sk-${"b".repeat(25)}`;
    expect(redactSecrets(raw)).toBe("key1=[REDACTED] key2=[REDACTED]");
  });

  it("redacts Anthropic key before OpenAI pattern so 'ant-' prefix is not left behind", () => {
    const key = `sk-ant-api03-${"x".repeat(30)}`;
    expect(redactSecrets(key)).toBe("[REDACTED]");
  });
});

describe("LLMError", () => {
  it("has name LLMError", () => {
    const err = new LLMError("rate_limit", "anthropic", "too many requests", true);
    expect(err.name).toBe("LLMError");
  });

  it("exposes code, provider, retryable", () => {
    const err = new LLMError("unauthorized", "openai", "bad key", false);
    expect(err.code).toBe("unauthorized");
    expect(err.provider).toBe("openai");
    expect(err.retryable).toBe(false);
    expect(err.message).toBe("bad key");
  });

  it("is instanceof Error", () => {
    const err = new LLMError("network", "anthropic", "timeout", true);
    expect(err).toBeInstanceOf(Error);
  });
});
