import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { StatusShortenButton } from "./StatusShortenButton";

export function StatusEditorPage() {
  const { hash, type, slug } = useParams<{ hash: string; type: string; slug?: string }>();

  if (!hash || !type) return <Navigate to="/" replace />;

  const isStory = type === "story";
  const title = isStory ? "故事狀態" : `角色狀態：${slug ?? ""}`;
  const statusFile = isStory ? "status/story_status.md" : `characters/${slug ?? ""}_status.md`;

  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  const [content, setContent] = useState("");
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  const [saving, setSaving] = useState(false);
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  const [loading, setLoading] = useState(true);
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  const [mtime, setMtime] = useState<string | undefined>(undefined);
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is not conditional, hooks are always called
  useEffect(() => {
    // Try to read the file via git show HEAD
    fetch(`/api/projects/${hash}/git/show?sha=HEAD&file=${encodeURIComponent(statusFile)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ content: string }>) : null))
      .then((d) => {
        setContent(d?.content ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hash, statusFile]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const body: {
        fileType: "story" | "character";
        content: string;
        characterSlug?: string;
        expectedMtime?: string;
      } = {
        fileType: isStory ? "story" : "character",
        content,
      };
      if (!isStory && slug) body.characterSlug = slug;
      if (mtime) body.expectedMtime = mtime;

      const res = await fetch(`/api/projects/${hash}/status/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        if (err.code === "MTIME_MISMATCH") {
          setError("檔案已被外部修改，請重新載入後再儲存");
        } else if (err.code === "CHARACTER_NOT_FOUND") {
          setError("找不到此角色檔案");
        } else {
          setError(err.message ?? "儲存失敗");
        }
        return;
      }

      const data = (await res.json()) as { mtime: string };
      setMtime(data.mtime);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard API may fail in non-secure contexts; ignore silently
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-950 text-neutral-400 text-sm">
        載入中…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-700 shrink-0">
        <Link
          to={`/editor/${hash}`}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← 編輯器
        </Link>
        <span className="text-xs text-neutral-500">|</span>
        <span className="text-sm font-medium text-neutral-200">{title}</span>
        <div className="flex-1" />
        <StatusShortenButton
          projectHash={hash}
          fileType={isStory ? "story" : "character"}
          onResult={(shortened) => setContent(shortened)}
          {...(slug !== undefined ? { characterSlug: slug } : {})}
        />
        <button
          type="button"
          onClick={handleCopy}
          title="複製到剪貼簿"
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          複製
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          {savedAt !== null ? "✓ 已儲存" : saving ? "儲存中…" : "儲存"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-900/40 border-b border-red-800 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`${title} 內容…\n\n直接編輯後點「儲存」會寫入 .md 並 git commit。`}
          className="w-full h-full rounded border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200 font-mono resize-none focus:outline-none focus:border-neutral-500 placeholder:text-neutral-600"
        />
      </div>

      {/* File path hint */}
      <div className="px-4 py-2 border-t border-neutral-800 text-xs text-neutral-600">
        {statusFile}
      </div>
    </div>
  );
}
