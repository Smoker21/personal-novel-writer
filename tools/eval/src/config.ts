import type { InferenceMode } from "./runtimes/runtime.js";
import type { CaseId, SamplingProfile } from "./types.js";

export const SAMPLING_PROFILES = {
  creative: {
    temperature: 1.0,
    topP: 0.6,
    presencePenalty: 0.4,
    frequencyPenalty: 0.4,
  },
  instruct: {
    temperature: 0.5,
    topP: 0.5,
    presencePenalty: 0.6,
    frequencyPenalty: 0.6,
  },
} as const satisfies Record<string, SamplingProfile>;

export type ProfileKey = keyof typeof SAMPLING_PROFILES;

export const CASE_PROFILE: Record<CaseId, ProfileKey> = {
  "TC-01": "creative",
  "TC-02": "instruct",
  "TC-03": "creative",
  "TC-04": "instruct",
  "TC-05": "instruct",
  "TC-06": "creative",
  "TC-07": "creative",
  "TC-08": "creative",
};

export const CASE_MAX_TOKENS: Record<CaseId, number> = {
  "TC-01": 1200,
  "TC-02": 4096,
  "TC-03": 2400,
  "TC-04": 1024,
  "TC-05": 600,
  "TC-06": 800,
  "TC-07": 2000,
  // TC-08 8-1 / 8-2 / 8-4 ask for ~3000 中文字。1 中文字 ≈ 1.5 tokens for RWKV
  // tokenizer; budget 5500 + margin for 8-4's longer set-up.
  "TC-08": 6000,
};

export interface RuntimeProfile {
  name: string;
  endpoint: string;
  modelId?: string;
  defaultProfile: ProfileKey;
  stop?: string[];
  /** Inference path. Default falls back to "chat" if omitted. */
  mode?: InferenceMode;
  /**
   * Per-runtime sampling overrides keyed by profile.
   * Lets us encode "Qwen prefers T=0.7 top_p=0.9" vs "RWKV prefers T=1.0 top_p=0.6".
   */
  samplingOverrides?: Partial<Record<ProfileKey, Partial<SamplingProfile>>>;
  /** Extra fields merged into every chat/completions body. */
  extraBody?: Record<string, unknown>;
  /**
   * Extra max_tokens budget added to every case to accommodate models that
   * emit chain-of-thought BEFORE the visible answer (Qwen3.5 thinking, etc.).
   * The "thinking" portion goes into reasoning_content (separate from content);
   * but it still counts against max_tokens.
   */
  thinkingTokenBudget?: number;
}

export const RUNTIME_PROFILES: Record<string, RuntimeProfile> = {
  "rwkv-runner": {
    name: "rwkv-runner",
    endpoint: "http://localhost:27777/v1",
    defaultProfile: "creative",
    stop: ["\n\nUser:", "\n\nHuman:"],
    // 2026-05-10 evidence: chat-completions endpoint munges system+user into a
    // pseudo-conversation template that triggers RWKV's "ask user back" mode
    // for long-form continuation tasks. Default to /v1/completions with the
    // hand-crafted RWKV-World prompt template instead.
    mode: "completions",
  },
  "lm-studio": {
    name: "lm-studio",
    endpoint: "http://localhost:1234/v1",
    defaultProfile: "creative",
    mode: "chat", // Qwen / Llama via LM Studio use proper chat templates
    // Transformer (Qwen / Llama / etc.) friendly defaults — see runtimes/rwkv-runner.md §4
    samplingOverrides: {
      creative: {
        temperature: 0.7,
        topP: 0.9,
        presencePenalty: undefined,
        frequencyPenalty: undefined,
      },
      instruct: {
        temperature: 0.2,
        topP: 0.9,
        presencePenalty: undefined,
        frequencyPenalty: undefined,
      },
    },
    // Qwen3 / Qwen3.5 default to "thinking mode" which fills `reasoning_content`.
    // We try the standard toggle, but the Aggressive Qwen3.5-35B-A3B variant
    // ignores it — it always thinks first. So:
    //   1. Send the disable flag in case future variants honour it.
    //   2. Add a generous thinking token budget so content still fits.
    extraBody: {
      chat_template_kwargs: { enable_thinking: false },
    },
    thinkingTokenBudget: 2000,
  },
  ollama: {
    name: "ollama",
    endpoint: "http://localhost:11434/v1",
    defaultProfile: "creative",
    samplingOverrides: {
      creative: {
        temperature: 0.7,
        topP: 0.9,
        presencePenalty: undefined,
        frequencyPenalty: undefined,
      },
      instruct: {
        temperature: 0.2,
        topP: 0.9,
        presencePenalty: undefined,
        frequencyPenalty: undefined,
      },
    },
  },
};
