import type { GitCommit } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";

interface PreviewState {
  commit: GitCommit;
  content: string | null;
  diff: string | null;
  view: "preview" | "diff";
}

interface Props {
  projectHash: string;
  file: string | undefined;
  open: boolean;
  onClose: () => void;
  onReverted: (() => void) | undefined;
}

export function HistoryPanel({ projectHash, file, open, onClose, onReverted }: Props) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    setLoading(true);
    const url = `/api/projects/${projectHash}/git/log?limit=50${file ? `&file=${encodeURIComponent(file)}` : ""}`;
    fetch(url)
      .then((r) => r.json() as Promise<{ commits: GitCommit[] }>)
      .then((d) => setCommits(d.commits))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectHash, file, open]);

  const loadPreview = async (commit: GitCommit) => {
    if (!file) return;
    setPreview({ commit, content: null, diff: null, view: "preview" });
    const res = await fetch(
      `/api/projects/${projectHash}/git/show?sha=${commit.sha}&file=${encodeURIComponent(file)}`,
    );
    const data = res.ok ? ((await res.json()) as { content: string }) : null;
    setPreview((p) => (p ? { ...p, content: data?.content ?? "(檔案在此版本不存在)" } : null));
  };

  const loadDiff = async () => {
    if (!preview?.commit || !file) return;
    const res = await fetch(
      `/api/projects/${projectHash}/git/diff?sha=${preview.commit.sha}&file=${encodeURIComponent(file)}&against=current`,
    );
    const data = res.ok ? ((await res.json()) as { unifiedDiff: string }) : null;
    setPreview((p) => (p ? { ...p, diff: data?.unifiedDiff ?? "", view: "diff" } : null));
  };

  const doRevert = async () => {
    if (!preview?.commit || !file) return;
    if (!confirm(`還原 ${file} 到 ${preview.commit.shortSha}？此動作將建立新 commit。`)) return;
    const res = await fetch(`/api/projects/${projectHash}/git/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: preview.commit.sha, file }),
    });
    if (res.ok) {
      onReverted?.();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-96 bg-neutral-900 border-l border-neutral-700 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 shrink-0">
          <h2 className="text-sm font-semibold text-neutral-200">版本歷史</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Commits list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-neutral-500">載入中…</p>}
          {!loading && commits.length === 0 && (
            <p className="p-4 text-sm text-neutral-500">無歷史記錄</p>
          )}
          {commits.map((commit) => (
            <button
              key={commit.sha}
              type="button"
              onClick={() => loadPreview(commit)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-800 hover:bg-neutral-800 transition-colors ${preview?.commit.sha === commit.sha ? "bg-neutral-800 border-l-2 border-l-indigo-500" : ""}`}
            >
              <p className="text-xs font-mono text-indigo-400">{commit.shortSha}</p>
              <p className="text-sm text-neutral-200 truncate">{commit.message}</p>
              <p className="text-xs text-neutral-500">
                {new Date(commit.date).toLocaleString("zh-TW")}
              </p>
              <p className="text-xs text-neutral-600">
                +{commit.files.reduce((s, f) => s + f.additions, 0)} -
                {commit.files.reduce((s, f) => s + f.deletions, 0)}
              </p>
            </button>
          ))}
        </div>

        {/* Preview pane */}
        {preview && file && (
          <div className="border-t border-neutral-700 flex flex-col" style={{ maxHeight: "50%" }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 shrink-0">
              <button
                type="button"
                onClick={() => setPreview((p) => (p ? { ...p, view: "preview" } : null))}
                className={`text-xs ${preview.view === "preview" ? "text-indigo-400" : "text-neutral-400"}`}
              >
                預覽
              </button>
              <button
                type="button"
                onClick={loadDiff}
                className={`text-xs ${preview.view === "diff" ? "text-indigo-400" : "text-neutral-400"}`}
              >
                Diff
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={doRevert}
                className="rounded border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
              >
                還原到此版本
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 text-xs font-mono text-neutral-300 whitespace-pre-wrap">
              {preview.view === "preview" && (preview.content ?? "載入中…")}
              {preview.view === "diff" && preview.diff !== null && (
                <DiffView unifiedDiff={preview.diff} />
              )}
              {preview.view === "diff" && preview.diff === null && "載入中…"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffView({ unifiedDiff }: { unifiedDiff: string }) {
  if (!unifiedDiff) return <span className="text-neutral-500">（無差異）</span>;
  return (
    <>
      {unifiedDiff.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "bg-green-900/30 text-green-300"
              : line.startsWith("-") && !line.startsWith("---")
                ? "bg-red-900/30 text-red-300"
                : "text-neutral-400"
          }
        >
          {line || " "}
        </div>
      ))}
    </>
  );
}
