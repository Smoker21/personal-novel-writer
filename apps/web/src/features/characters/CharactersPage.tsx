import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CharacterEditor } from "./CharacterEditor";
import { CharacterPanel } from "./CharacterPanel";

export function CharactersPage() {
  const { hash } = useParams<{ hash: string }>();
  if (!hash) return <Navigate to="/" replace />;
  return <CharactersPageInner projectHash={hash} />;
}

function CharactersPageInner({ projectHash }: { projectHash: string }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSave = () => {
    setRefreshKey((k) => k + 1);
    setIsNew(false);
  };

  const handleNew = () => {
    setSelectedSlug(null);
    setIsNew(true);
  };

  const handleSelect = (slug: string) => {
    setSelectedSlug(slug);
    setIsNew(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Left: character list */}
      <div className="w-60 shrink-0 border-r border-neutral-700 flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-700 flex items-center gap-2">
          <Link
            to={`/editor/${projectHash}`}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            ← 編輯器
          </Link>
          <span className="text-xs text-neutral-500">|</span>
          <span className="text-xs font-semibold text-neutral-200">角色管理</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <CharacterPanel
            projectHash={projectHash}
            selectedSlug={selectedSlug}
            onSelect={handleSelect}
            onNew={handleNew}
            refreshKey={refreshKey}
          />
        </div>
      </div>

      {/* Right: character editor */}
      <div className="flex-1 overflow-hidden">
        {selectedSlug || isNew ? (
          <CharacterEditor
            projectHash={projectHash}
            slug={isNew ? null : selectedSlug}
            onSave={handleSave}
            onClose={() => {
              setSelectedSlug(null);
              setIsNew(false);
            }}
            onDelete={() => {
              setSelectedSlug(null);
              setRefreshKey((k) => k + 1);
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            請從左側選擇角色，或點「+ 新增」建立角色
          </div>
        )}
      </div>
    </div>
  );
}
