import { useState } from "react";

interface Props {
  projectHash: string;
  fileType: "story" | "character";
  characterSlug?: string;
  onResult: (shortened: string) => void;
}

export function StatusShortenButton({ projectHash, fileType, characterSlug, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [preserveMarked, setPreserveMarked] = useState(true);

  const handleClick = async () => {
    setLoading(true);
    try {
      const body: {
        fileType: "story" | "character";
        preserveMarkedSections: boolean;
        characterSlug?: string;
      } = { fileType, preserveMarkedSections: preserveMarked };
      if (characterSlug !== undefined) body.characterSlug = characterSlug;

      const res = await fetch(`/api/projects/${projectHash}/status/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as { shortenedContent: string };
        onResult(data.shortenedContent);
      } else {
        const err = (await res.json()) as { message?: string };
        alert(`精簡失敗：${err.message ?? "未知錯誤"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-neutral-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={preserveMarked}
          onChange={(e) => setPreserveMarked(e.target.checked)}
          className="rounded"
        />
        保留 🔖/✨ 段
      </label>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded border border-indigo-700 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40 transition-colors"
      >
        {loading ? "精簡中…" : "AI 精簡"}
      </button>
    </div>
  );
}
