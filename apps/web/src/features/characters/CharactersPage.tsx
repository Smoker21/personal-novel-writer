/**
 * CharactersPage — M5 portrait grid 主視圖
 *
 * grid 模式：portrait grid + 搜尋 + 「+ 新增」AddPortraitCard
 * editor 模式：點卡片進入 CharacterEditor（同頁 swap）
 */
import type { CharacterListItem } from "@novel-writer/shared-types";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AddPortraitCard, PortraitCard, PortraitGrid } from "../../components";
import { CharacterEditor } from "./CharacterEditor";

export function CharactersPage() {
  const { hash } = useParams<{ hash: string }>();
  if (!hash) return <Navigate to="/" replace />;
  return <CharactersPageInner projectHash={hash} />;
}

type Mode = { kind: "grid" } | { kind: "edit"; slug: string } | { kind: "new" };

function CharactersPageInner({ projectHash }: { projectHash: string }) {
  const [mode, setMode] = useState<Mode>({ kind: "grid" });
  const [characters, setCharacters] = useState<CharacterListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCharacters(null);
    fetch(`/api/projects/${projectHash}/characters`)
      .then((r) => r.json() as Promise<{ characters: CharacterListItem[] }>)
      .then((d) => {
        if (!cancelled) setCharacters(d.characters);
      })
      .catch(() => {
        if (!cancelled) setCharacters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectHash, refreshKey]);

  const filtered = useMemo(() => {
    if (!characters) return [];
    const q = query.trim().toLowerCase();
    if (q === "") return characters;
    return characters.filter((c) => {
      const blob = `${c.name} ${c.role ?? ""} ${c.oneLineSummary}`.toLowerCase();
      return blob.includes(q);
    });
  }, [characters, query]);

  const handleSave = () => {
    setRefreshKey((k) => k + 1);
    setMode({ kind: "grid" });
  };

  const handleDelete = async (slug: string) => {
    const res = await fetch(`/api/projects/${projectHash}/characters/${slug}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setRefreshKey((k) => k + 1);
    }
    setDeleteConfirm(null);
  };

  if (mode.kind !== "grid") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-4 py-2">
          <button
            type="button"
            onClick={() => setMode({ kind: "grid" })}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            ← 回角色列表
          </button>
          <span className="text-xs text-neutral-500">|</span>
          <Link
            to={`/editor/${projectHash}`}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            ← 編輯器
          </Link>
        </div>
        <div className="flex-1 overflow-hidden">
          <CharacterEditor
            key={mode.kind === "edit" ? mode.slug : "new"}
            projectHash={projectHash}
            slug={mode.kind === "edit" ? mode.slug : null}
            onSave={handleSave}
            onClose={() => setMode({ kind: "grid" })}
            onDelete={() => {
              setRefreshKey((k) => k + 1);
              setMode({ kind: "grid" });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <Link
          to={`/editor/${projectHash}`}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          ← 編輯器
        </Link>
        <span className="text-xs text-neutral-500">|</span>
        <span className="text-xs font-semibold text-neutral-200">角色管理</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋角色（名字 / 定位 / 摘要）"
          className="ml-4 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setMode({ kind: "new" })}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + 新增角色
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {characters === null ? (
          <p className="text-sm text-neutral-500">載入中…</p>
        ) : filtered.length === 0 && query === "" ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400">尚未建立任何角色。點以下卡片開始：</p>
            <PortraitGrid>
              <AddPortraitCard onClick={() => setMode({ kind: "new" })} />
            </PortraitGrid>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-neutral-500">沒有符合「{query}」的角色。</p>
        ) : (
          <PortraitGrid>
            {filtered.map((c) => (
              <PortraitCard
                key={c.slug}
                projectHash={projectHash}
                data={{
                  slug: c.slug,
                  name: c.name,
                  role: c.role,
                  portraitDefault: c.portraitDefault,
                }}
                variant="browse"
                onClick={() => setMode({ kind: "edit", slug: c.slug })}
                onEdit={() => setMode({ kind: "edit", slug: c.slug })}
                onDelete={() => setDeleteConfirm(c.slug)}
              />
            ))}
            <AddPortraitCard onClick={() => setMode({ kind: "new" })} />
          </PortraitGrid>
        )}
      </div>

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onMouseDown={() => setDeleteConfirm(null)}
        >
          <div
            className="rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm text-neutral-200">
              確定刪除角色「{deleteConfirm}」？此操作會刪除 .md / _status.md / portrait 並 git commit。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded border border-neutral-600 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
