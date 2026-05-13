interface RoutingValues {
  chapterWriter: string;
  characterCardConsolidator: string;
  characterImageExtractor: string;
  statusUpdater: string;
}

const PRESETS: Array<{ label: string; values: RoutingValues }> = [
  {
    label: "全雲端 Haiku",
    values: {
      chapterWriter: "anthropic:claude-haiku-4-5",
      characterCardConsolidator: "anthropic:claude-haiku-4-5",
      characterImageExtractor: "anthropic:claude-sonnet-4-6",
      statusUpdater: "anthropic:claude-haiku-4-5",
    },
  },
  {
    label: "Cloud + 地端 fallback",
    values: {
      chapterWriter: "anthropic:claude-sonnet-4-6",
      characterCardConsolidator: "anthropic:claude-haiku-4-5",
      characterImageExtractor: "anthropic:claude-sonnet-4-6",
      statusUpdater: "anthropic:claude-haiku-4-5",
    },
  },
  {
    label: "全地端 Qwen",
    values: {
      chapterWriter: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      characterCardConsolidator: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      characterImageExtractor: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      statusUpdater: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
    },
  },
  {
    label: "測試版 RWKV",
    values: {
      chapterWriter: "ollama:qwen2.5:14b",
      characterCardConsolidator: "ollama:qwen2.5:7b",
      characterImageExtractor: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      statusUpdater: "ollama:qwen2.5:7b",
    },
  },
];

interface Props {
  onApply: (values: RoutingValues) => void;
}

export function PresetButtons({ onApply }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onApply(preset.values)}
          className="rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
