import type { CharacterListItem } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";

interface Props {
  projectHash: string;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onNew: () => void;
  refreshKey?: number;
}

export function CharacterPanel({ projectHash, selectedSlug, onSelect, onNew, refreshKey }: Props) {
  const [characters, setCharacters] = useState<CharacterListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectHash}/characters`)
      .then((r) => r.json())
      .then((data: { characters?: CharacterListItem[] } | null) =>
        setCharacters(data?.characters ?? []),
      )
      .catch(() => setCharacters([]))
      .finally(() => setLoading(false));
  }, [projectHash, refreshKey]);

  if (loading) {
    return <div className="p-4 text-neutral-400 text-sm">載入中…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <h2 className="text-sm font-semibold text-neutral-200">角色</h2>
        <button
          type="button"
          onClick={onNew}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          + 新增
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {characters.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">尚無角色。點「新增」建立第一個角色。</p>
        )}
        {characters.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => onSelect(c.slug)}
            className={`w-full text-left px-4 py-3 border-b border-neutral-800 transition-colors hover:bg-neutral-800 ${
              selectedSlug === c.slug ? "bg-neutral-800 border-l-2 border-l-indigo-500" : ""
            }`}
          >
            <p className="text-sm text-neutral-100">{c.name}</p>
            <p className="text-xs text-neutral-400 truncate mt-0.5">
              {c.oneLineSummary || c.role || ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
