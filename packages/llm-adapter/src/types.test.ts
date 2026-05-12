import { describe, it, expect } from "vitest";
import { parseModelId } from "./types.js";

describe("parseModelId", () => {
  it("parses a standard cloud model ID", () => {
    expect(parseModelId("anthropic:claude-sonnet-4-6")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("parses an OpenAI model ID", () => {
    expect(parseModelId("openai:gpt-4.1")).toEqual({
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  it("handles model IDs where the model part itself contains colons (e.g. Ollama tags)", () => {
    // ADR-0004 explicitly requires first-colon split for "ollama:llama3:8b"
    expect(parseModelId("ollama:llama3:8b")).toEqual({
      provider: "ollama",
      model: "llama3:8b",
    });
  });

  it("handles deeply nested colons in model part", () => {
    expect(parseModelId("ollama:qwen2.5:14b:q4")).toEqual({
      provider: "ollama",
      model: "qwen2.5:14b:q4",
    });
  });

  it("throws when no colon is present", () => {
    expect(() => parseModelId("no-colon-here")).toThrow();
  });

  it("throws with empty string", () => {
    expect(() => parseModelId("")).toThrow();
  });
});
