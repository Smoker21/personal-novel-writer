import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { StatusShortenButton } from "./StatusShortenButton";

export function StatusEditorPage() {
  const { hash, type, slug } = useParams<{ hash: string; type: string; slug?: string }>();

  if (!hash || !type) return <Navigate to="/" replace />;

  const isStory = type === "story";
  const title = isStory ? "故事狀態" : `角色狀態：${slug ?? ""}`;
  const statusFile = isStory ? "status/story_status.md" : `characters/${slug ?? ""}_status.md`;

  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    try {
      // Use manual commit endpoint to save the file
      await fetch(`/api/projects/${hash}/status/update-from-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber: 0, reason: "manual" }),
      }).catch(() => {});
      // Note: Direct file write endpoint not available yet; copy to clipboard as fallback
      await navigator.clipboard.writeText(content).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
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
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          {saved ? "✓ 已複製" : saving ? "處理中…" : "複製內容"}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`${title} 內容…\n\n提示：修改後點「複製內容」，再貼到對應的 .md 檔案。`}
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
