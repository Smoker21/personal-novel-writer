import type { ChapterListItem } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";

interface Props {
  projectHash: string;
  currentChapter: number | null;
  onSelectChapter: (n: number) => void;
  onCreateChapter: () => void;
}

export function ChapterList({
  projectHash,
  currentChapter,
  onSelectChapter,
  onCreateChapter,
}: Props) {
  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/projects/${projectHash}/chapters/`);
    if (!res.ok) return;
    const data = (await res.json()) as { chapters: ChapterListItem[] };
    setChapters(data.chapters);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh closes over projectHash; intentional
  useEffect(() => {
    void refresh();
  }, [projectHash]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/chapters/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const ch = (await res.json()) as { number: number };
        await refresh();
        onCreateChapter();
        onSelectChapter(ch.number);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="w-64 border-r overflow-y-auto p-3">
      <h2 className="text-xs font-medium text-gray-500 mb-2">章節</h2>
      <ul className="space-y-1">
        {chapters.map((ch) => (
          <li key={ch.number}>
            <button
              type="button"
              onClick={() => onSelectChapter(ch.number)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                ch.number === currentChapter ? "bg-blue-100" : "hover:bg-gray-100"
              }`}
            >
              <div className="font-medium truncate">
                第 {ch.number} 章 · {ch.title}
              </div>
              <div className="text-xs text-gray-400">{ch.wordCount} 字</div>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="mt-3 w-full px-2 py-1 border border-dashed rounded text-sm text-gray-500 hover:bg-gray-50"
      >
        + 新章節
      </button>
    </aside>
  );
}
