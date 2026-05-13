import type { AppSettings } from "@novel-writer/shared-types";
import { defaultSettings } from "@novel-writer/shared-types";

export const mockSettings: AppSettings = {
  ...defaultSettings(),
  providers: {
    ...defaultSettings().providers,
    anthropic: {
      enabled: true,
      apiKey: "sk-ant***mock",
      defaultModel: "claude-sonnet-4-6",
    },
    ollama: {
      enabled: true,
      endpoint: "http://localhost:11434",
    },
  },
};
