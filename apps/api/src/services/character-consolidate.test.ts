import type { LLMRouter, RoutingPolicy } from "@novel-writer/llm-adapter";
import type { CharacterFields } from "@novel-writer/shared-types";
import { describe, expect, it, vi } from "vitest";
import { consolidateCharacter } from "./character-consolidate.js";

function makeRouter(text: string): LLMRouter {
  return {
    generate: vi.fn().mockResolvedValue({
      text,
      usage: { inputTokens: 10, outputTokens: 50 },
      finishReason: "end",
      modelId: "test:model",
    }),
    stream: vi.fn(),
  } as unknown as LLMRouter;
}

const policy: RoutingPolicy = { primary: "test:model", fallbacks: [], retryPerModel: 1 };

const fields: CharacterFields = {
  name: "蘇晴",
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

describe("consolidateCharacter", () => {
  it("parses clean JSON response", async () => {
    const result = await consolidateCharacter({
      router: makeRouter('{"body":"她是個內向的人","oneLineSummary":"30 歲女作家"}'),
      policy,
      fields,
    });
    expect(result.body).toBe("她是個內向的人");
    expect(result.oneLineSummary).toBe("30 歲女作家");
  });

  it("strips markdown code fence from response", async () => {
    const result = await consolidateCharacter({
      router: makeRouter('```json\n{"body":"body text","oneLineSummary":"summary"}\n```'),
      policy,
      fields,
    });
    expect(result.body).toBe("body text");
  });

  it("strips plain code fence without language tag", async () => {
    const result = await consolidateCharacter({
      router: makeRouter('```\n{"body":"no lang fence","oneLineSummary":"ok"}\n```'),
      policy,
      fields,
    });
    expect(result.body).toBe("no lang fence");
  });

  it("retries on invalid JSON and succeeds on second attempt", async () => {
    const router = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          text: "not valid json at all",
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: "end",
          modelId: "test:model",
        })
        .mockResolvedValueOnce({
          text: '{"body":"retry body","oneLineSummary":"retry summary"}',
          usage: { inputTokens: 10, outputTokens: 50 },
          finishReason: "end",
          modelId: "test:model",
        }),
      stream: vi.fn(),
    } as unknown as LLMRouter;

    const result = await consolidateCharacter({ router, policy, fields });
    expect(result.body).toBe("retry body");
    expect(router.generate as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("throws on invalid schema (missing oneLineSummary)", async () => {
    const router = {
      generate: vi.fn().mockResolvedValue({
        text: '{"body":"body only"}',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: "end",
        modelId: "test:model",
      }),
      stream: vi.fn(),
    } as unknown as LLMRouter;

    await expect(consolidateCharacter({ router, policy, fields })).rejects.toThrow();
  });
});
